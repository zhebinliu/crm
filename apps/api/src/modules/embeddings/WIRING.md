# Wave 17 — RAG Embeddings: Wiring TODO for orchestrator

This wave is constrained to NOT modify `apps/api/src/app.module.ts`.
The orchestrator must register the new module before this code runs.

## Required change in `apps/api/src/app.module.ts`

Add the import and the module to the `imports` array:

```ts
import { EmbeddingsModule } from './modules/embeddings/embeddings.module';

@Module({
  imports: [
    // ...existing modules...
    EmbeddingsModule,  // ← new (provides EmbeddingService globally)
    // ...
  ],
})
```

`EmbeddingsModule` is `@Global()`, so any service can inject
`EmbeddingService` once the module is registered. Order does not matter.

## What is already wired (DO NOT redo)

- `LeadService`, `AccountService` constructor-inject `EmbeddingService`
  and override `buildEmbeddingContent()` (in `BaseEntityService`).
- `BaseEntityService.afterCreate` / `afterUpdate` fire-and-forget upserts
  to `record_embeddings`.
- `AiChatService` constructor-injects `EmbeddingService` and prepends a
  "Relevant records" block to the system prompt for both `chat()` and
  `chatStream()`. Falls back silently if retrieval is empty/errors.

## DB / extension state

- `record_embeddings` table created via raw SQL (pgvector unavailable on
  the target Postgres; using `Float[]` + in-process cosine).
- To migrate to pgvector when available:
  1. `CREATE EXTENSION IF NOT EXISTS vector;`
  2. Change `embedding Float[]` → `embedding Unsupported("vector(1536)")`
     in `packages/db/prisma/schema.prisma`.
  3. Switch `EmbeddingService.searchSimilar` to `$queryRawUnsafe` with
     `ORDER BY embedding <=> $1::vector LIMIT k`.

## Optional env

- `OPENAI_API_KEY` — when set, real `text-embedding-3-small` embeddings
  are computed. When unset, a deterministic feature-hashing fallback is
  used (works, but worse semantic quality).

## Endpoint

- `POST /admin/embeddings/reindex` — body `{ recordType?: string }` —
  requires `ai.invoke` permission. Returns `{ count, recordType }`.
