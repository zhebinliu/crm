# ─────────────────────────────────────────────────────────────────────────────
# Tokenwave Web (Next.js 15) — multi-stage production image
# Build context MUST be the repo root (monorepo).
#   docker build -f apps/web/Dockerfile -t tokenwave-web .
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ── Stage 1: install (workspace-aware) ──────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json            apps/web/package.json
COPY apps/api/package.json            apps/api/package.json
COPY packages/db/package.json         packages/db/package.json
COPY packages/shared/package.json     packages/shared/package.json
COPY packages/rule-engine/package.json packages/rule-engine/package.json
RUN pnpm install --frozen-lockfile

# ── Stage 2: build web ──────────────────────────────────────────────────────
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared     packages/shared
COPY apps/web            apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# Build @tokenwave/shared first (the web app transpiles it but its dist is handy)
RUN pnpm --filter @tokenwave/shared build
RUN pnpm --filter @tokenwave/web build

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next standalone emits a ready-to-run bundle rooted at .next/standalone
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
