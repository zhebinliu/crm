// ─── EventBusService ─────────────────────────────────────────────────────
// The Headless 360 event mesh: dispatches OutboxEvent rows to:
//   • Redis Streams      — durable cross-process consumer queue
//                          (name: `events:<tenantId>`, capped at 10k entries)
//   • Local PubSub       — fan-out to GraphQL Subscriptions in this process
//
// Flow:
//   1. OutboxService.emit() writes to outbox_events (transactionally with
//      whatever wrote the record) — guaranteed durable
//   2. EventBusService runs every 1s as a leader-elected dispatcher (here
//      single-process; production would use a redlock)
//   3. Dispatcher pulls unprocessed events, fans out to Redis Streams +
//      PubSub, then marks processed
//
// The stream entries follow Salesforce Platform Event naming:
//   { event: "Lead.Created", tenant, recordType, recordId, payload, at }

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

const STREAM_MAXLEN = 10_000;
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 50;

export const PUB_SUB = Symbol('PUB_SUB');

interface EventEnvelope {
  event: string;          // "Lead.Created"
  tenantId: string;
  recordType: string;
  recordId: string;
  payload: unknown;
  at: string;             // ISO timestamp
  outboxId: string;
}

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventBusService.name);
  private readonly pubsub = new PubSub();
  private redis: Redis | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.EVENT_BUS_DISABLED === 'true') {
      this.log.log('Event bus disabled via EVENT_BUS_DISABLED');
      return;
    }
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    try {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      await this.redis.connect();
    } catch (e) {
      this.log.warn(`Redis unavailable (${(e as Error).message}); events will only fan out via local PubSub`);
      this.redis = null;
    }
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e)), POLL_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  /** Public API: subscribe to a topic. Used by GraphQL @Subscription resolvers. */
  asyncIterator(triggers: string | string[]): AsyncIterator<unknown> {
    return this.pubsub.asyncIterableIterator(triggers as string | readonly string[]);
  }

  /** Publish-on-write helper (bypasses outbox poll). Used for ad-hoc events. */
  async publishDirect(envelope: EventEnvelope): Promise<void> {
    await this.dispatch(envelope);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const batch = await this.prisma.outboxEvent.findMany({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) return;
      for (const row of batch) {
        const envelope: EventEnvelope = {
          event: this.toPlatformName(row.eventType),
          tenantId: row.tenantId,
          recordType: row.recordType,
          recordId: row.recordId,
          payload: row.payload,
          at: row.createdAt.toISOString(),
          outboxId: row.id,
        };
        try {
          await this.dispatch(envelope);
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { processedAt: new Date(), attempts: row.attempts + 1 },
          });
        } catch (e) {
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts: row.attempts + 1,
              lastError: (e as Error).message?.slice(0, 500),
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async dispatch(envelope: EventEnvelope) {
    // Local PubSub fan-out — by tenant + by global topic
    await this.pubsub.publish(`events.${envelope.tenantId}`, envelope);
    await this.pubsub.publish(`events.${envelope.tenantId}.${envelope.recordType}`, envelope);
    await this.pubsub.publish(`events.${envelope.tenantId}.${envelope.recordType}.${envelope.recordId}`, envelope);

    // Redis Streams — durable cross-process queue
    if (this.redis) {
      await this.redis.xadd(
        `events:${envelope.tenantId}`,
        'MAXLEN',
        '~',
        STREAM_MAXLEN.toString(),
        '*',
        'event', envelope.event,
        'recordType', envelope.recordType,
        'recordId', envelope.recordId,
        'at', envelope.at,
        'outboxId', envelope.outboxId,
        'payload', JSON.stringify(envelope.payload),
      );
    }
  }

  /**
   * Convert legacy event names like "lead.created" to Salesforce Platform
   * Event style "Lead.Created". Caller-provided names with capital letters
   * pass through unchanged.
   */
  private toPlatformName(eventType: string): string {
    if (/[A-Z]/.test(eventType)) return eventType;
    return eventType
      .split('.')
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
      .join('.');
  }
}
