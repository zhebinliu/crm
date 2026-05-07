// ─── Redis-backed ThrottlerStorage ────────────────────────────────────────
//
// Distributed rate limiting: every API instance increments the same Redis
// counter for a given (tracker, throttler) tuple, so multiple instances do
// not each grant independent buckets.
//
// Algorithm: INCR + EXPIRE NX (only set TTL on the first increment in a
// window). When a tracker exceeds `limit`, we set a separate `block` key
// that the @nestjs/throttler runtime consults via `isBlocked`.
//
// Fallback: if Redis cannot be reached (connect error, command timeout),
// we degrade to a per-process in-memory counter so the API keeps serving
// instead of crashing. We log loudly when this happens; an outage of
// Redis is operational, not a fatal startup problem.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

// `ThrottlerStorageRecord` is the interface the @nestjs/throttler runtime
// expects back from `increment`. The package only exports the symbol from
// its barrel, so we restate the shape here.
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface MemoryRecord {
  count: number;
  expiresAt: number;
  blockedUntil: number;
}

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(RedisThrottlerStorage.name);
  private redis: Redis | null = null;
  private redisAvailable = false;
  private readonly memory = new Map<string, MemoryRecord>();
  private readonly keyPrefix = 'rl:'; // rate-limit

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Keep the storage usable even if the cluster is briefly down.
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.redis.on('error', (err) => {
      if (this.redisAvailable) {
        this.log.warn(`Throttler Redis error, falling back to memory: ${err.message}`);
      }
      this.redisAvailable = false;
    });
    this.redis.on('ready', () => {
      this.redisAvailable = true;
      this.log.log('Throttler Redis connected; distributed rate limiting active');
    });
    try {
      await this.redis.connect();
      this.redisAvailable = true;
    } catch (e) {
      this.log.error(
        `Throttler Redis connect failed (${(e as Error).message}); using in-memory fallback. Multi-instance deploys will not share counters.`,
      );
      this.redisAvailable = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis?.quit();
    } catch {
      // ignore
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // ttl/blockDuration are in milliseconds in @nestjs/throttler v6+.
    if (this.redisAvailable && this.redis) {
      try {
        return await this.incrementRedis(key, ttl, limit, blockDuration);
      } catch (e) {
        this.log.warn(
          `Throttler Redis op failed (${(e as Error).message}); using memory for this request`,
        );
        return this.incrementMemory(key, ttl, limit, blockDuration);
      }
    }
    return this.incrementMemory(key, ttl, limit, blockDuration);
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const redis = this.redis!;
    const counterKey = `${this.keyPrefix}${key}`;
    const blockKey = `${this.keyPrefix}b:${key}`;

    // If currently blocked, return the block info without incrementing further.
    const blockTtlMs = await redis.pttl(blockKey);
    if (blockTtlMs > 0) {
      const counterTtlMs = await redis.pttl(counterKey);
      return {
        totalHits: limit + 1,
        timeToExpire: counterTtlMs > 0 ? counterTtlMs : ttl,
        isBlocked: true,
        timeToBlockExpire: blockTtlMs,
      };
    }

    const pipeline = redis.multi();
    pipeline.incr(counterKey);
    pipeline.pttl(counterKey);
    const result = await pipeline.exec();
    if (!result || !result[0] || !result[1]) {
      throw new Error('redis pipeline returned null');
    }
    const totalHits = Number(result[0][1]);
    let timeToExpire = Number(result[1][1]);

    if (totalHits === 1 || timeToExpire < 0) {
      await redis.pexpire(counterKey, ttl);
      timeToExpire = ttl;
    }

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit && blockDuration > 0) {
      // SET NX so concurrent over-limit hits don't keep extending the block.
      const setRes = await redis.set(
        blockKey,
        '1',
        'PX',
        blockDuration,
        'NX',
      );
      isBlocked = true;
      timeToBlockExpire = setRes === 'OK' ? blockDuration : await redis.pttl(blockKey);
      if (timeToBlockExpire < 0) timeToBlockExpire = blockDuration;
    } else if (totalHits > limit) {
      isBlocked = true;
      timeToBlockExpire = timeToExpire;
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    let rec = this.memory.get(key);
    if (!rec || rec.expiresAt <= now) {
      rec = { count: 0, expiresAt: now + ttl, blockedUntil: 0 };
      this.memory.set(key, rec);
    }
    rec.count += 1;
    const timeToExpire = Math.max(0, rec.expiresAt - now);
    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (rec.blockedUntil > now) {
      isBlocked = true;
      timeToBlockExpire = rec.blockedUntil - now;
    } else if (rec.count > limit) {
      isBlocked = true;
      if (blockDuration > 0) {
        rec.blockedUntil = now + blockDuration;
        timeToBlockExpire = blockDuration;
      } else {
        timeToBlockExpire = timeToExpire;
      }
    }
    // Lazy GC to keep the map bounded.
    if (this.memory.size > 5000) {
      for (const [k, v] of this.memory) {
        if (v.expiresAt <= now && v.blockedUntil <= now) this.memory.delete(k);
      }
    }
    return {
      totalHits: rec.count,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
