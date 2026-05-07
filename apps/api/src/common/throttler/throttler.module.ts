// ─── Rate-limit module ────────────────────────────────────────────────────
//
// Multi-tier rate limiting for the API. Tiers run in parallel; a request
// must pass every tier it's subject to. Endpoints can override individual
// tiers with @Throttle({ short: { ... }, long: { ... } }).
//
// Default tier table (applied to ALL routes via the APP_GUARD provider —
// see "Wiring TODO" in the commit message):
//
//   short  — 100 req/sec        per (tenant, ip)
//   long   — 1000 req/min       per (tenant, ip)
//
// Auth login (set on the controller method):
//   short  — 5 req/sec          per ip   (login is unauthenticated)
//   long   — 50 req/min         per ip
//
// Bulk + import (heavy ops):
//   long   — 10 req/min         per (tenant, ip)
//
// Storage: Redis (see RedisThrottlerStorage). Falls back to in-memory if
// Redis is unreachable so a Redis outage doesn't 5xx the whole API. The
// fallback is per-process, so distributed enforcement is best-effort
// during the outage.

import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds, minutes } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { TenantThrottlerGuard } from './tenant-throttler.guard';

export const RATE_LIMIT_TIERS = {
  default: {
    short: { ttl: seconds(1), limit: 100 },
    long: { ttl: minutes(1), limit: 1000 },
  },
  authLogin: {
    short: { ttl: seconds(1), limit: 5 },
    long: { ttl: minutes(1), limit: 50 },
  },
  heavy: {
    long: { ttl: minutes(1), limit: 10 },
  },
} as const;

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // RedisThrottlerStorage is provided by this module (below) and
      // injected into the factory.
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        // Two named throttlers run in parallel for the default tier.
        // Per-route @Throttle({...}) overrides any of these by name.
        throttlers: [
          {
            name: 'short',
            ttl: RATE_LIMIT_TIERS.default.short.ttl,
            limit: RATE_LIMIT_TIERS.default.short.limit,
          },
          {
            name: 'long',
            ttl: RATE_LIMIT_TIERS.default.long.ttl,
            limit: RATE_LIMIT_TIERS.default.long.limit,
          },
        ],
      }),
      inject: [RedisThrottlerStorage],
    }),
  ],
  providers: [RedisThrottlerStorage, TenantThrottlerGuard],
  exports: [ThrottlerModule, RedisThrottlerStorage, TenantThrottlerGuard],
})
export class AppThrottlerModule {}
