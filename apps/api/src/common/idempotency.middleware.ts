// ─── Idempotency-Key middleware ──────────────────────────────────────────
//
// Standard pattern (Stripe-style): client sends `Idempotency-Key: <uuid>`
// on a mutation. If the same key arrives again within the TTL window:
//   • Same request body → return the original response (status + body) so
//     retries are safe.
//   • Different request body → 409 Conflict (key was reused for a
//     different operation, which is a client bug).
//
// Keyed by (tenantId, userId, idempotency-key) so different tenants/users
// can't collide. Hashes the request method + path + body to detect mismatch.
// Response is captured by wrapping res.json/send.
//
// Only applies to mutation methods (POST/PUT/PATCH/DELETE). GET is naturally
// idempotent. Skipped if no header present.
//
// TTL default 24h — long enough for retries through outages, short enough
// to bound Redis growth.

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import Redis from 'ioredis';

const TTL_SECONDS = 60 * 60 * 24;      // 24h
const KEY_PREFIX = 'idem:';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CachedResponse {
  status: number;
  body: unknown;
  bodyHash: string;
}

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly redis: Redis;
  private readonly log = new Logger(IdempotencyMiddleware.name);

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });
    this.redis.connect().catch((e) => {
      this.log.error(`Idempotency Redis connect failed: ${(e as Error).message}`);
    });
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!MUTATION_METHODS.has(req.method)) return next();

    const key = req.header('Idempotency-Key') ?? req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 200) return next();

    // tenant + user scope from JWT user (set by passport jwt strategy)
    const user = (req as Request & { user?: { id?: string; tenantId?: string } }).user;
    const tenantId = user?.tenantId ?? '_anon';
    const userId = user?.id ?? '_anon';

    const bodyHash = hashBody(req.method, req.originalUrl, req.body);
    const redisKey = `${KEY_PREFIX}${tenantId}:${userId}:${key}`;

    // Try to read existing result
    try {
      const cached = await this.redis.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedResponse;
        if (parsed.bodyHash !== bodyHash) {
          res.status(409).json({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message:
                'Idempotency-Key was reused with a different request body. ' +
                'Use a fresh key per distinct operation.',
            },
          });
          return;
        }
        res.setHeader('X-Idempotent-Replay', '1');
        res.status(parsed.status).json(parsed.body);
        return;
      }
    } catch (e) {
      this.log.warn(`Idempotency lookup failed (continuing without): ${(e as Error).message}`);
    }

    // Capture response
    const originalJson = res.json.bind(res);
    let captured = false;
    res.json = (body: unknown) => {
      if (!captured && res.statusCode >= 200 && res.statusCode < 300) {
        captured = true;
        const payload: CachedResponse = {
          status: res.statusCode,
          body,
          bodyHash,
        };
        this.redis
          .set(redisKey, JSON.stringify(payload), 'EX', TTL_SECONDS)
          .catch((err) => this.log.warn(`Idempotency store failed: ${(err as Error).message}`));
      }
      return originalJson(body);
    };

    next();
  }
}

function hashBody(method: string, url: string, body: unknown): string {
  const payload = JSON.stringify({ method, url, body: body ?? null });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
