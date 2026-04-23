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

# ── Stage 1: install full workspace deps (incl. dev, for build tools) ──────
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
# @tokenwave/db has no runtime consumer in apps/api (api imports
# @prisma/client directly) — we only need prisma generate, not tsc build.
RUN pnpm --filter @tokenwave/db exec prisma generate
RUN pnpm --filter @tokenwave/shared build \
 && pnpm --filter @tokenwave/rule-engine build \
 && pnpm --filter @tokenwave/api build

# Produce a slim deployable bundle with only prod deps + built workspace
# packages resolved into real node_modules (no symlinks). As defense in
# depth, overlay the built dist/ folders over whatever pnpm deploy packs,
# so a regression in pack behavior can't produce an unbootable image.
RUN pnpm --filter @tokenwave/api --prod deploy /out \
 && mkdir -p /out/node_modules/@tokenwave/shared \
             /out/node_modules/@tokenwave/rule-engine \
 && rm -rf /out/node_modules/@tokenwave/shared/dist \
           /out/node_modules/@tokenwave/rule-engine/dist \
 && cp -a /repo/packages/shared/dist \
          /out/node_modules/@tokenwave/shared/dist \
 && cp -a /repo/packages/rule-engine/dist \
          /out/node_modules/@tokenwave/rule-engine/dist \
 && cp -a /repo/node_modules/.prisma \
          /out/node_modules/.prisma

# ── Stage 3: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

# Deployed bundle: /out/{package.json, node_modules, dist, ...}
COPY --from=builder --chown=nestjs:nodejs /out /app

USER nestjs
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
