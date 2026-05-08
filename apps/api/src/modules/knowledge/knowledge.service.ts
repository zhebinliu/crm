// ─── KnowledgeService ────────────────────────────────────────────────────
// Knowledge Base for case deflection (Wave 19h).
//
// Articles have lifecycle states (draft → published → archived) and version
// numbers that bump on every meaningful edit. Engagement metrics (view,
// helpful, not-helpful) feed into article quality signals.
//
// Semantic search hooks into the existing EmbeddingService + RagReranker
// pipeline so support agents (and the AI Copilot) can suggest relevant
// articles for a Case based on its subject + description.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmbeddingService } from '../embeddings/embedding.service';
import { RagRerankerService } from '../ai/rag-reranker.service';
import type { RequestUser } from '../../common/types/request-context';

export interface KnowledgeListOptions {
  search?: string;
  status?: string;
  category?: string;
  ownerId?: string;
  skip?: number;
  take?: number;
}

export interface KnowledgeSuggestion {
  id: string;
  articleNumber: string;
  title: string;
  summary: string | null;
  category: string | null;
  /** 0..1, lower = more similar (cosine distance). */
  distance: number;
  rerankScore?: number;
}

@Injectable()
export class KnowledgeService extends BaseEntityService {
  constructor(
    private readonly prisma: PrismaService,
    workflow: WorkflowService,
    validation: ValidationRuleService,
    audit: AuditService,
    emitter: EventEmitter2,
    outbox: OutboxService,
    embeddings: EmbeddingService,
    private readonly reranker: RagRerankerService,
  ) {
    super(workflow, validation, audit, emitter, outbox);
    this.embeddings = embeddings;
  }

  // KnowledgeArticle becomes a recognized recordType in RecordEmbedding.
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'knowledge_article') return null;
    const onlyPublished = (record['status'] as string | null) === 'published';
    if (!onlyPublished) return null;
    return knowledgeArticleContent({
      title: record['title'] as string | null,
      summary: record['summary'] as string | null,
      content: record['content'] as string | null,
      category: record['category'] as string | null,
      tags: (record['tags'] as string[] | null) ?? [],
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async list(tenantId: string, opts: KnowledgeListOptions = {}) {
    const { search, status, category, ownerId, skip = 0, take = 20 } = opts;
    const where = {
      tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { content: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.findMany({
        where, skip, take, orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);
    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const a = await this.prisma.knowledgeArticle.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!a) throw new NotFoundException(`Article ${id} not found`);
    return a;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'knowledge_article', input, undefined, user);
    const articleNumber = await this.nextArticleNumber(tenantId);
    const created = await this.prisma.knowledgeArticle.create({
      data: {
        tenantId,
        articleNumber,
        title: (input.title as string) ?? 'Untitled',
        content: (input.content as string) ?? '',
        summary: (input.summary as string | null) ?? null,
        status: (input.status as string) ?? 'draft',
        category: (input.category as string | null) ?? null,
        tags: (input.tags as string[] | null) ?? [],
        ownerId: (input.ownerId as string) || user.id,
      },
    });
    await this.afterCreate(tenantId, 'knowledge_article', created as Record<string, unknown>, user);
    return created;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'knowledge_article', input, previous as Record<string, unknown>, user);

    // Bump version on any content/title/summary change.
    const bump =
      (input.title !== undefined && input.title !== previous.title) ||
      (input.content !== undefined && input.content !== previous.content) ||
      (input.summary !== undefined && input.summary !== previous.summary);

    const patch: Record<string, unknown> = { ...input };
    if (bump) patch.version = previous.version + 1;

    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: patch,
    });
    await this.afterUpdate(
      tenantId, 'knowledge_article',
      updated as Record<string, unknown>,
      previous as Record<string, unknown>,
      user,
    );
    return updated;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.afterSoftDelete(
      tenantId, 'knowledge_article',
      previous as Record<string, unknown>, user,
    );
  }

  // ── Lifecycle transitions ────────────────────────────────────────────

  async publish(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), archivedAt: null },
    });
    await this.afterUpdate(
      tenantId, 'knowledge_article',
      updated as Record<string, unknown>,
      previous as Record<string, unknown>,
      user,
    );
    return updated;
  }

  async archive(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.afterUpdate(
      tenantId, 'knowledge_article',
      updated as Record<string, unknown>,
      previous as Record<string, unknown>,
      user,
    );
    return updated;
  }

  async revertToDraft(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    const updated = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: { status: 'draft', publishedAt: null, archivedAt: null },
    });
    await this.afterUpdate(
      tenantId, 'knowledge_article',
      updated as Record<string, unknown>,
      previous as Record<string, unknown>,
      user,
    );
    return updated;
  }

  // ── Engagement ──────────────────────────────────────────────────────

  async recordView(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { id: true, viewCount: true },
    });
  }

  async markHelpful(tenantId: string, id: string, _userId: string) {
    await this.get(tenantId, id);
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
      select: { id: true, helpfulCount: true },
    });
  }

  async markNotHelpful(tenantId: string, id: string, _userId: string) {
    await this.get(tenantId, id);
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: { notHelpfulCount: { increment: 1 } },
      select: { id: true, notHelpfulCount: true },
    });
  }

  // ── Search ───────────────────────────────────────────────────────────

  /**
   * Free-text search across published articles. Tries semantic search
   * first, falls back to LIKE if no embeddings indexed yet.
   */
  async search(tenantId: string, q: string, limit = 10) {
    const trimmed = (q ?? '').trim();
    if (!trimmed) return [];

    const hits = this.embeddings
      ? await this.embeddings.searchSimilar(
          tenantId, 'knowledge_article', trimmed, Math.max(limit * 3, 12),
        )
      : [];
    if (hits.length === 0) {
      // Nothing indexed yet — fall back to lexical search on title/content.
      const rows = await this.prisma.knowledgeArticle.findMany({
        where: {
          tenantId,
          status: 'published',
          deletedAt: null,
          OR: [
            { title: { contains: trimmed, mode: 'insensitive' } },
            { content: { contains: trimmed, mode: 'insensitive' } },
            { summary: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: [{ helpfulCount: 'desc' }, { viewCount: 'desc' }],
      });
      return rows.map((a) => ({
        id: a.id,
        articleNumber: a.articleNumber,
        title: a.title,
        summary: a.summary,
        category: a.category,
        distance: 0.5,
      } as KnowledgeSuggestion));
    }

    // Hydrate hits with article rows; filter out non-published / deleted.
    const ids = hits.map((h) => h.recordId);
    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
        status: 'published',
      },
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    const reranked = await this.reranker.rerank(trimmed, hits, limit * 2);

    const out: KnowledgeSuggestion[] = [];
    for (const h of reranked) {
      const a = byId.get(h.recordId);
      if (!a) continue;
      out.push({
        id: a.id,
        articleNumber: a.articleNumber,
        title: a.title,
        summary: a.summary,
        category: a.category,
        distance: h.distance,
        rerankScore: h.rerankScore,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Case-deflection: given a Case's subject + description, return the
   * top-K published articles likely to resolve it.
   */
  async searchForCase(
    tenantId: string,
    caseSubject: string,
    caseDescription: string | null,
    limit = 5,
  ): Promise<KnowledgeSuggestion[]> {
    const query = [caseSubject, caseDescription].filter(Boolean).join('\n');
    return this.search(tenantId, query, limit);
  }

  /** Convenience: load the Case by id then call searchForCase. */
  async suggestForCaseId(
    tenantId: string,
    caseId: string,
    limit = 5,
  ): Promise<KnowledgeSuggestion[]> {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId, deletedAt: null },
      select: { subject: true, description: true },
    });
    if (!c) throw new NotFoundException(`Case ${caseId} not found`);
    return this.searchForCase(tenantId, c.subject, c.description, limit);
  }

  /** Link an article to a case (analytics / "which articles helped"). */
  async linkToCase(
    tenantId: string,
    caseId: string,
    articleId: string,
    source: string = 'linked_by_agent',
  ) {
    return this.prisma.caseArticleLink.upsert({
      where: { caseId_articleId: { caseId, articleId } },
      create: { tenantId, caseId, articleId, source },
      update: { source },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async nextArticleNumber(tenantId: string): Promise<string> {
    const ctr = await this.prisma.sequenceCounter.upsert({
      where: { tenantId_key: { tenantId, key: 'kb' } },
      update: { value: { increment: 1 } },
      create: { tenantId, key: 'kb', value: 1 },
    });
    return `KB-${String(ctr.value).padStart(4, '0')}`;
  }
}

/** Project a knowledge article into the text we embed for RAG. */
export function knowledgeArticleContent(a: {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  category?: string | null;
  tags?: string[] | null;
}): string {
  const tags = (a.tags ?? []).filter(Boolean).join(', ');
  return [a.title, a.category, tags, a.summary, a.content]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}
