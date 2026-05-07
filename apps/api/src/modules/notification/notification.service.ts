// ─── NotificationService ───────────────────────────────────────────────────
// Lightweight per-user inbox. Other services call `push()` to enqueue;
// the bell-icon dropdown polls `list()` and calls `markRead()` / `markAllRead()`.

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EVENTS } from '@tokenwave/shared';

export interface PushNotificationInput {
  tenantId: string;
  userId: string;
  level?: NotificationLevel;
  kind: string;
  title: string;
  body?: string;
  targetType?: string;
  targetId?: string;
}

@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async push(input: PushNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          level: input.level ?? NotificationLevel.INFO,
          kind: input.kind,
          title: input.title.slice(0, 200),
          body: input.body?.slice(0, 1000),
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
    } catch (e) {
      this.log.warn(`failed to push notification kind=${input.kind} user=${input.userId}: ${(e as Error).message}`);
    }
  }

  async list(tenantId: string, userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
    const take = Math.min(Math.max(1, opts.take ?? 20), 100);
    const where: Record<string, unknown> = { tenantId, userId };
    if (opts.unreadOnly) where.readAt = null;

    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
    ]);
    return { data, unreadCount };
  }

  async markRead(tenantId: string, userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ── Producers ─────────────────────────────────────────────────────────────

  /**
   * Daily at 09:00 server time: scan for activities due today (or overdue
   * within last 24h) and notify their owners. Idempotent — checks for an
   * existing 'activity_due' notification on the same activityId before push.
   */
  @Cron('0 9 * * *')
  async scanActivityDue(): Promise<void> {
    if (process.env.NOTIF_ACTIVITY_DUE_DISABLED === 'true') return;
    try {
      const tomorrow = new Date(Date.now() + 86_400_000);
      const yesterday = new Date(Date.now() - 86_400_000);
      const activities = await this.prisma.activity.findMany({
        where: {
          deletedAt: null,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueDate: { gte: yesterday, lte: tomorrow },
        },
        select: {
          id: true, tenantId: true, ownerId: true,
          subject: true, type: true, dueDate: true, priority: true,
          targetType: true, targetId: true,
        },
        take: 1000,
      });

      for (const a of activities) {
        // Skip if we already pushed an activity_due notification for this one.
        const existing = await this.prisma.notification.findFirst({
          where: {
            tenantId: a.tenantId,
            userId: a.ownerId,
            kind: 'activity_due',
            targetType: 'activity',
            targetId: a.id,
            createdAt: { gte: new Date(Date.now() - 24 * 86_400_000) },
          },
          select: { id: true },
        });
        if (existing) continue;

        const overdue = a.dueDate && a.dueDate.getTime() < Date.now();
        await this.push({
          tenantId: a.tenantId,
          userId: a.ownerId,
          level: overdue ? NotificationLevel.WARNING : NotificationLevel.INFO,
          kind: 'activity_due',
          title: overdue ? '任务已过期' : '今日待办',
          body: a.subject,
          targetType: 'activity',
          targetId: a.id,
        });
      }
      this.log.log(`scanActivityDue: ${activities.length} activities checked`);
    } catch (e) {
      this.log.error(`scanActivityDue failed: ${(e as Error).message}`);
    }
  }

  // ── Event-driven producers ────────────────────────────────────────────────

  @OnEvent('opp.won')
  async onOpportunityWon(payload: { tenantId: string; opportunityId: string }): Promise<void> {
    try {
      const opp = await this.prisma.opportunity.findUnique({
        where: { id: payload.opportunityId },
        select: { name: true, ownerId: true, amount: true },
      });
      if (!opp) return;
      await this.push({
        tenantId: payload.tenantId,
        userId: opp.ownerId,
        level: NotificationLevel.SUCCESS,
        kind: 'opp_won',
        title: `🎉 商机赢单 — ${opp.name}`,
        body: opp.amount ? `成交金额 ¥${Number(opp.amount).toLocaleString()}` : undefined,
        targetType: 'opportunity',
        targetId: payload.opportunityId,
      });
    } catch (e) {
      this.log.warn(`onOpportunityWon failed: ${(e as Error).message}`);
    }
  }

  @OnEvent('opp.lost')
  async onOpportunityLost(payload: { tenantId: string; opportunityId: string }): Promise<void> {
    try {
      const opp = await this.prisma.opportunity.findUnique({
        where: { id: payload.opportunityId },
        select: { name: true, ownerId: true },
      });
      if (!opp) return;
      await this.push({
        tenantId: payload.tenantId,
        userId: opp.ownerId,
        level: NotificationLevel.WARNING,
        kind: 'opp_lost',
        title: `商机丢单 — ${opp.name}`,
        body: '建议复盘原因并归档',
        targetType: 'opportunity',
        targetId: payload.opportunityId,
      });
    } catch (e) {
      this.log.warn(`onOpportunityLost failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(EVENTS.LEAD_CONVERTED)
  async onLeadConverted(payload: { tenantId: string; leadId: string; userId?: string }): Promise<void> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: payload.leadId },
        select: { firstName: true, lastName: true, company: true, ownerId: true },
      });
      if (!lead) return;
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company;
      await this.push({
        tenantId: payload.tenantId,
        userId: lead.ownerId,
        level: NotificationLevel.SUCCESS,
        kind: 'lead_converted',
        title: `线索已转化 — ${fullName}`,
        body: `${lead.company}`,
        targetType: 'lead',
        targetId: payload.leadId,
      });
    } catch (e) {
      this.log.warn(`onLeadConverted failed: ${(e as Error).message}`);
    }
  }
}
