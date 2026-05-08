// ─── Health endpoints ────────────────────────────────────────────────────
//
// /healthz/live   — process liveness. Always 200 if Node is alive. K8s
//                   liveness probe — failure = pod restart.
// /healthz/ready  — readiness. 200 only when DB + Redis + BullMQ are all
//                   reachable. K8s readiness probe — failure = drain.
// /health         — legacy combined endpoint, kept 200 for back-compat
//                   with the web app and AI Copilot.
//
// Routes are all marked @Public() and excluded from the global /api
// prefix in main.ts so probes hit `/healthz/*` directly.
//
// Wave 18e (observability).

import { Controller, Get, HttpCode, HttpStatus, Optional, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import Redis from 'ioredis';
import { Public } from './modules/auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

interface ComponentMap {
  db: boolean;
  redis: boolean;
  queue: boolean;
}

@Controller()
@Public()
export class HealthController {
  // One shared Redis ping client. Lazy-connect so a missing Redis at
  // boot doesn't crash startup; we just report `redis: false` until it
  // comes back.
  private readonly pingRedis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue('workflow') private readonly workflowQueue?: Queue,
  ) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.pingRedis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Quiet retry storm on probes when Redis is down.
      retryStrategy: () => null,
    });
    // Swallow connection errors — health checks are the source of truth.
    this.pingRedis.on('error', () => undefined);
  }

  // ── /healthz/live ─────────────────────────────────────────────────────
  // Liveness: process is up. Never touch external deps here — failing
  // this on a transient DB blip would cause a pod restart loop.
  @Get('healthz/live')
  @HttpCode(HttpStatus.OK)
  live(): { ok: true; ts: string } {
    return { ok: true, ts: new Date().toISOString() };
  }

  // ── /healthz/ready ────────────────────────────────────────────────────
  // Readiness: ALL of {DB, Redis, BullMQ workers} must be healthy.
  @Get('healthz/ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const components = await this.checkComponents();
    const ok = components.db && components.redis && components.queue;
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { ok, components, ts: new Date().toISOString() };
  }

  // ── /health (legacy) ──────────────────────────────────────────────────
  // Always 200, includes both pieces of state. Web app + AI Copilot rely
  // on this returning 200 even when downstream deps are flaky.
  @Get('health')
  async legacyCheck() {
    const components = await this.checkComponents();
    return {
      status: 'ok',
      time: new Date().toISOString(),
      db: components.db ? 'ok' : 'error',
      redis: components.redis ? 'ok' : 'error',
      queue: components.queue ? 'ok' : 'error',
    };
  }

  // ── component probes ──────────────────────────────────────────────────

  private async checkComponents(): Promise<ComponentMap> {
    const [db, redis, queue] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueue(),
    ]);
    return { db, redis, queue };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      // ioredis lazy-connects on first command; PING doubles as connectivity check.
      const reply = await Promise.race([
        this.pingRedis.status === 'ready'
          ? this.pingRedis.ping()
          : (async () => {
              if (this.pingRedis.status === 'wait' || this.pingRedis.status === 'end') {
                await this.pingRedis.connect().catch(() => undefined);
              }
              return this.pingRedis.ping();
            })(),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
      ]);
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  private async checkQueue(): Promise<boolean> {
    if (!this.workflowQueue) return true; // not registered → not a failure
    try {
      // getWaiting() returns when the queue's Redis connection is healthy.
      // We don't care about the count, just that the call completes.
      await Promise.race([
        this.workflowQueue.getWaiting(0, 0),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
