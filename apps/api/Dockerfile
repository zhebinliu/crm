# ─────────────────────────────────────────────────────────────────────────────
# Tokenwave API (NestJS + Prisma) — multi-stage production image
# Build context MUST be the repo root (monorepo).
#   docker build -f apps/api/Dockerfile -t tokenwave-api .
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl python3 make g++
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# ── Stage 1: install ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json              apps/web/package.json
COPY apps/api/package.json              apps/api/package.json
COPY packages/db/package.json           packages/db/package.json
COPY packages/shared/package.json       packages/shared/package.json
COPY packages/rule-engine/package.json  packages/rule-engine/package.json
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ─────────────────────────────────────────────────────────
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared       packages/shared
COPY packages/rule-engine  packages/rule-engine
COPY packages/db           packages/db
COPY apps/api              apps/api
# Generate Prisma client then build workspace packages + api
RUN pnpm --filter @tokenwave/db exec prisma generate
RUN pnpm --filter @tokenwave/shared build \
 && pnpm --filter @tokenwave/rule-engine build \
 && pnpm --filter @tokenwave/db build \
 && pnpm --filter @tokenwave/api build

# ── Stage 3: runtime ───────────────────────────────────────────────────────
# We keep dev deps to ensure the generated Prisma client (inside
# packages/db/node_modules) and nest runtime helpers resolve cleanly. The
# image is still compact (~400–600 MB) because dist/ is pre-built and no
# source/build step is re-run here.
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

# Copy the fully built monorepo (node_modules included) so workspace
# resolution "just works" at runtime without another install step.
COPY --from=builder --chown=nestjs:nodejs /repo /app

USER nestjs
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
