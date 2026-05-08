// ─── EmbeddingService — semantic search foundation for RAG (Wave 17) ──────
//
// Computes 1536-dim text embeddings (OpenAI text-embedding-3-small when
// OPENAI_API_KEY is set, deterministic hash-RNG fallback otherwise) and
// persists them per-record on the tenant-scoped `record_embeddings` table.
//
// Storage strategy:
//   - Preferred: pgvector + `<=>` cosine distance via raw SQL.
//   - Fallback (this codepath, since pgvector is not installed in the
//     local Postgres): `Float[]` column + in-process cosine similarity.
//
// Both write and search are tenant-isolated.
//
// Embedding pipeline is fire-and-forget from caller writes — it must
// never block or fail a record create/update. Errors are logged.

import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiRedactorService } from '../ai/pii-redactor.service';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;

export interface SimilarityHit {
  recordType: string;
  recordId: string;
  content: string;
  /** Cosine distance — lower is more similar (0 = identical). */
  distance: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private warnedNoKey = false;

  constructor(
    private readonly prisma: PrismaService,
    // Optional so this module can be loaded standalone (e.g. before AiModule
    // registers the redactor in tests). When absent, content is embedded raw.
    @Optional() private readonly redactor?: PiiRedactorService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Compute an embedding vector for text. Uses OpenAI when OPENAI_API_KEY is
   * configured; otherwise returns a deterministic hash-based embedding so
   * dev environments work without a key. The hash variant is NOT good
   * enough for production semantic similarity but does give stable,
   * comparable vectors for smoke tests.
   */
  async embedText(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (!this.warnedNoKey) {
        this.logger.warn(
          'OPENAI_API_KEY not set — using deterministic hash-embedding fallback. Semantic search quality will be poor.',
        );
        this.warnedNoKey = true;
      }
      return hashEmbedding(text, EMBED_DIM);
    }

    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vec = data.data?.[0]?.embedding;
      if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
        throw new Error(`OpenAI returned malformed embedding (len=${vec?.length})`);
      }
      return vec;
    } catch (err) {
      this.logger.warn(
        `OpenAI embedding failed; falling back to hash-embedding for this call: ${(err as Error).message}`,
      );
      return hashEmbedding(text, EMBED_DIM);
    }
  }

  /**
   * Upsert an embedding for a record. Skips re-embedding if the content
   * hash matches the existing row (so unchanged records are cheap to
   * "re-save"). Safe to call fire-and-forget; never throws.
   */
  async upsertRecordEmbedding(
    tenantId: string,
    recordType: string,
    recordId: string,
    content: string,
  ): Promise<void> {
    try {
      let trimmed = (content ?? '').trim();
      if (!trimmed) return;
      // PII guard: redact before sending to OpenAI's embedding API. Embedding
      // semantics are preserved (token-level redaction doesn't change topic
      // similarity) and the placeholder text is what's stored.
      if (this.redactor && this.redactor.isEnabled()) {
        trimmed = this.redactor.redact(trimmed).text;
      }
      const contentHash = sha256(trimmed);

      const existing = await this.prisma.recordEmbedding.findUnique({
        where: { tenantId_recordType_recordId: { tenantId, recordType, recordId } },
        select: { contentHash: true },
      });
      if (existing && existing.contentHash === contentHash) return;

      const embedding = await this.embedText(trimmed);

      await this.prisma.recordEmbedding.upsert({
        where: { tenantId_recordType_recordId: { tenantId, recordType, recordId } },
        create: {
          tenantId,
          recordType,
          recordId,
          embedding,
          contentHash,
          content: trimmed,
          model: EMBED_MODEL,
          dimension: EMBED_DIM,
        },
        update: {
          embedding,
          contentHash,
          content: trimmed,
          model: EMBED_MODEL,
          dimension: EMBED_DIM,
        },
      });
    } catch (err) {
      this.logger.warn(
        `upsertRecordEmbedding failed for ${recordType}/${recordId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Top-K semantic search within a tenant. `recordType` may be null to
   * search across all record types.
   *
   * pgvector path (when available): ORDER BY embedding <=> $query LIMIT K.
   * Fallback path (current): fetch all rows for the tenant scope, compute
   * cosine in-process. Fine for tens of thousands of rows; revisit when
   * pgvector lands.
   */
  async searchSimilar(
    tenantId: string,
    recordType: string | null,
    query: string,
    k = 8,
  ): Promise<SimilarityHit[]> {
    const trimmed = (query ?? '').trim();
    if (!trimmed) return [];

    let queryVec: number[];
    try {
      queryVec = await this.embedText(trimmed);
    } catch (err) {
      this.logger.warn(`searchSimilar embed failed: ${(err as Error).message}`);
      return [];
    }

    const rows = await this.prisma.recordEmbedding.findMany({
      where: {
        tenantId,
        ...(recordType ? { recordType } : {}),
      },
      select: { recordType: true, recordId: true, content: true, embedding: true },
    });

    const scored: SimilarityHit[] = rows.map((r) => ({
      recordType: r.recordType,
      recordId: r.recordId,
      content: r.content,
      distance: 1 - cosineSimilarity(queryVec, r.embedding as number[]),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, k);
  }

  /**
   * Backfill embeddings for all records of a given type (or all types if
   * unspecified) in a tenant. Returns the number of records (re)embedded.
   */
  async reindexAll(tenantId: string, recordType?: string): Promise<number> {
    const types = recordType ? [recordType] : ['lead', 'account'];
    let count = 0;
    for (const t of types) {
      count += await this.reindexType(tenantId, t);
    }
    return count;
  }

  private async reindexType(tenantId: string, recordType: string): Promise<number> {
    let count = 0;
    if (recordType === 'lead') {
      const leads = await this.prisma.lead.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true, firstName: true, lastName: true, company: true,
          title: true, email: true, industry: true, description: true, status: true,
        },
      });
      for (const l of leads) {
        const content = leadContent(l);
        if (!content) continue;
        await this.upsertRecordEmbedding(tenantId, 'lead', l.id, content);
        count++;
      }
    } else if (recordType === 'account') {
      const accounts = await this.prisma.account.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true, name: true, industry: true, type: true,
          website: true, description: true,
        },
      });
      for (const a of accounts) {
        const content = accountContent(a);
        if (!content) continue;
        await this.upsertRecordEmbedding(tenantId, 'account', a.id, content);
        count++;
      }
    }
    return count;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

export function leadContent(l: {
  firstName?: string | null; lastName?: string | null; company?: string | null;
  title?: string | null; email?: string | null; industry?: string | null;
  description?: string | null; status?: string | null;
}): string {
  const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ');
  return [
    fullName, l.company, l.title, l.email, l.industry, l.status, l.description,
  ].filter((s) => s && String(s).trim()).join(' • ');
}

export function accountContent(a: {
  name?: string | null; industry?: string | null; type?: string | null;
  website?: string | null; description?: string | null;
}): string {
  return [a.name, a.industry, a.type, a.website, a.description]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}

export function contactContent(c: {
  firstName?: string | null; lastName?: string | null; title?: string | null;
  department?: string | null; email?: string | null; phone?: string | null;
  mobile?: string | null;
}): string {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return [fullName, c.title, c.department, c.email, c.phone, c.mobile]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}

export function opportunityContent(o: {
  name?: string | null; stage?: string | null; amount?: unknown;
  accountName?: string | null; type?: string | null; leadSource?: string | null;
  nextStep?: string | null; description?: string | null;
}): string {
  const amountStr = o.amount != null && String(o.amount).trim() ? String(o.amount) : null;
  return [
    o.name, o.stage, amountStr, o.accountName, o.type, o.leadSource, o.nextStep, o.description,
  ]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}

export function activityContent(a: {
  subject?: string | null; type?: string | null; description?: string | null;
  status?: string | null; priority?: string | null; dueDate?: unknown;
}): string {
  const dueStr = a.dueDate
    ? (a.dueDate instanceof Date ? a.dueDate.toISOString() : String(a.dueDate))
    : null;
  return [a.subject, a.type, a.status, a.priority, dueStr, a.description]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}

export function caseContent(c: {
  caseNumber?: string | null; subject?: string | null; description?: string | null;
  status?: string | null; priority?: string | null; source?: string | null;
}): string {
  return [c.caseNumber, c.subject, c.status, c.priority, c.source, c.description]
    .filter((s) => s && String(s).trim())
    .join(' • ');
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Deterministic feature-hashing pseudo-embedding. Tokenizes the input
 * (lowercase, alphanumeric, length≥2) and projects each token into a
 * 1536-dim sparse vector via SHA-256 → bucket+sign. Documents that share
 * tokens end up with non-trivial cosine similarity; documents with no
 * shared tokens are near-orthogonal. NOT a substitute for real
 * embeddings — set OPENAI_API_KEY for production semantic quality —
 * but good enough that "fintech" matches a lead containing "fintech".
 */
function hashEmbedding(text: string, dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return out;

  for (const tok of tokens) {
    // Two independent hashes: one selects a bucket, one selects the sign.
    // This is the standard "feature hashing" / hashing-trick recipe.
    const h = createHash('sha256').update(tok).digest();
    const bucket =
      (((h[0] ?? 0) << 24) | ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0)) >>> 0;
    const sign = ((h[4] ?? 0) & 1) === 0 ? 1 : -1;
    out[bucket % dim] = (out[bucket % dim] ?? 0) + sign;
  }

  // L2-normalise so cosine similarity ranges in [-1, 1].
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += (out[i] ?? 0) ** 2;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) / norm;
  return out;
}

function tokenize(text: string): string[] {
  // Match runs of alphanumerics (incl. CJK ideographs) to collect tokens.
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu);
  return matches ?? [];
}
