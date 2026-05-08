// ─── RagRerankerService — second-stage reranker for RAG retrieval ─────────
//
// First-stage embedding search returns top-K by cosine; that surface is good
// for recall but noisy at the top. This service rescoring the candidates
// against the query and returns the top-N most relevant.
//
// Two strategies, picked at runtime:
//   • OpenAIReranker  — when OPENAI_API_KEY is set, a single gpt-4o-mini
//                       call scores every candidate 0-100.
//   • LexicalReranker — fallback. ~30 lines of inline BM25-style scoring.
//                       Free, deterministic, no network — fine for dev and
//                       a graceful degradation if OpenAI is throttled.
//
// Contract: `rerank()` never throws — on failure it returns the input
// candidates truncated to topN, preserving the original (cosine) order.

import { Injectable, Logger } from '@nestjs/common';
import type { SimilarityHit } from '../embeddings/embedding.service';

export interface RerankCandidate extends SimilarityHit {
  /** Optional — populated by reranker, 0-100 (higher = more relevant). */
  rerankScore?: number;
}

@Injectable()
export class RagRerankerService {
  private readonly logger = new Logger(RagRerankerService.name);

  /** Rerank `candidates` against `query`, returning top-N. */
  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topN = 8,
  ): Promise<RerankCandidate[]> {
    if (!candidates.length) return [];
    if (candidates.length <= 1) return candidates.slice(0, topN);

    const useOpenAI = !!process.env.OPENAI_API_KEY && process.env.AI_RERANKER !== 'lexical';
    if (useOpenAI) {
      try {
        const scored = await this.openAIRerank(query, candidates);
        return scored.slice(0, topN);
      } catch (err) {
        this.logger.warn(
          `OpenAI rerank failed, falling back to lexical: ${(err as Error).message}`,
        );
      }
    }
    return this.lexicalRerank(query, candidates).slice(0, topN);
  }

  // ── OpenAI reranker ─────────────────────────────────────────────────────

  private async openAIRerank(
    query: string,
    candidates: RerankCandidate[],
  ): Promise<RerankCandidate[]> {
    const apiKey = process.env.OPENAI_API_KEY!;
    const model = process.env.AI_RERANK_MODEL ?? 'gpt-4o-mini';

    // Build a compact prompt: list each candidate by index, ask for JSON
    // array of {index, score}. Truncate per-candidate content to keep
    // tokens bounded.
    const items = candidates.map((c, i) => {
      const snippet = c.content.length > 400 ? c.content.slice(0, 400) + '…' : c.content;
      return `${i}. ${snippet}`;
    });

    const userPrompt =
      `Query: ${query}\n\n` +
      `Candidates:\n${items.join('\n')}\n\n` +
      `Score each candidate from 0 to 100 for how relevant it is to the query. ` +
      `Return ONLY a JSON array like [{"index":0,"score":87},{"index":1,"score":12}].`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a relevance scorer for a CRM RAG system. Return strictly JSON, no prose.',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI rerank ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = this.parseScoreResponse(raw);
    if (!parsed) throw new Error('rerank: malformed JSON from OpenAI');

    // Apply scores; missing indices default to 0 (drop to bottom).
    const scoreById = new Map<number, number>();
    for (const r of parsed) scoreById.set(r.index, r.score);
    const out: RerankCandidate[] = candidates.map((c, i) => ({
      ...c,
      rerankScore: scoreById.get(i) ?? 0,
    }));
    out.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
    return out;
  }

  private parseScoreResponse(raw: string): Array<{ index: number; score: number }> | null {
    try {
      const j = JSON.parse(raw);
      // Accept either an array directly or an object with a single array prop.
      let arr: unknown[] = [];
      if (Array.isArray(j)) arr = j;
      else if (j && typeof j === 'object') {
        const vals = Object.values(j as Record<string, unknown>);
        const found = vals.find((v) => Array.isArray(v));
        if (Array.isArray(found)) arr = found;
      }
      const out: Array<{ index: number; score: number }> = [];
      for (const item of arr) {
        if (item && typeof item === 'object') {
          const i = Number((item as Record<string, unknown>).index);
          const s = Number((item as Record<string, unknown>).score);
          if (Number.isFinite(i) && Number.isFinite(s)) out.push({ index: i, score: s });
        }
      }
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  // ── Lexical (BM25-ish) reranker ────────────────────────────────────────
  //
  // Standard BM25 with k1=1.5, b=0.75. Works well enough for short CRM
  // record content (lead names, account descriptions). Tokenization mirrors
  // the embedding service so scoring is stable across both stages.

  private lexicalRerank(query: string, candidates: RerankCandidate[]): RerankCandidate[] {
    const k1 = 1.5;
    const b = 0.75;
    const N = candidates.length;
    const docs = candidates.map((c) => tokenize(c.content));
    const avgdl = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, N);

    // Document frequency per term.
    const df = new Map<string, number>();
    for (const d of docs) {
      const seen = new Set(d);
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    }

    const qTokens = new Set(tokenize(query));
    const scored = candidates.map((c, i) => {
      const d = docs[i] ?? [];
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const q of qTokens) {
        const f = tf.get(q) ?? 0;
        if (f === 0) continue;
        const idf = Math.log(1 + (N - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
        const norm = 1 - b + b * (d.length / (avgdl || 1));
        score += idf * ((f * (k1 + 1)) / (f + k1 * norm));
      }
      // Project to ~0-100 for parity with OpenAI scores; clamp.
      const projected = Math.min(100, Math.max(0, score * 25));
      return { ...c, rerankScore: projected };
    });
    scored.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
    return scored;
  }
}

function tokenize(text: string): string[] {
  const matches = (text ?? '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu);
  return matches ?? [];
}
