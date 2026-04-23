import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CATEGORIES: Record<string, string> = {
  prospecting: 'pipeline', qualification: 'pipeline', needs_analysis: 'pipeline',
  value_proposition: 'best_case', proposal: 'best_case',
  negotiation: 'commit',
  closed_won: 'closed', closed_lost: 'omitted',
};

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Quota targets ─────────────────────────────────────────────────────────

  async getTarget(tenantId: string, userId: string, period: string) {
    const target = await this.prisma.forecastTarget.findUnique({
      where: { tenantId_userId_period: { tenantId, userId, period } },
    });
    return { period, userId, quota: target ? Number(target.quota) : 0 };
  }

  async upsertTarget(tenantId: string, userId: string, period: string, quota: number) {
    const target = await this.prisma.forecastTarget.upsert({
      where: { tenantId_userId_period: { tenantId, userId, period } },
      update: { quota },
      create: { tenantId, userId, period, quota },
    });
    return { period, userId, quota: Number(target.quota) };
  }

  async listTargets(tenantId: string, period: string) {
    const targets = await this.prisma.forecastTarget.findMany({
      where: { tenantId, period },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return targets.map((t) => ({ ...t, quota: Number(t.quota) }));
  }

  // ── Forecast config (F2 + F3) ─────────────────────────────────────────────

  async getConfig(tenantId: string) {
    const cfg = await this.prisma.forecastConfig.findUnique({ where: { tenantId } });
    if (!cfg) {
      return {
        categories: DEFAULT_CATEGORIES,
        objectApiName: 'opportunity',
        amountField: 'amount',
        dateField: 'closeDate',
        stageField: 'stage',
        ownerField: 'ownerId',
      };
    }
    return {
      ...cfg,
      categories: { ...DEFAULT_CATEGORIES, ...(cfg.categories as Record<string, string>) },
    };
  }

  async upsertConfig(tenantId: string, dto: {
    categories?: Record<string, string>;
    objectApiName?: string;
    amountField?: string;
    dateField?: string;
    stageField?: string;
    ownerField?: string;
  }) {
    const data: any = {};
    if (dto.categories)    data.categories    = dto.categories;
    if (dto.objectApiName) data.objectApiName = dto.objectApiName;
    if (dto.amountField)   data.amountField   = dto.amountField;
    if (dto.dateField)     data.dateField     = dto.dateField;
    if (dto.stageField)    data.stageField    = dto.stageField;
    if (dto.ownerField)    data.ownerField    = dto.ownerField;

    const cfg = await this.prisma.forecastConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
    return { ...cfg, categories: { ...DEFAULT_CATEGORIES, ...(cfg.categories as Record<string, string>) } };
  }

  // ── Update tasks (F4) ─────────────────────────────────────────────────────

  async createUpdateTask(
    tenantId: string,
    createdById: string,
    dto: {
      period: string;
      title: string;
      dueDate: string;
      targetUserIds: string[];
      dateRangeFrom: string;
      dateRangeTo: string;
    },
  ) {
    // Fetch opps for snapshot
    const opps = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ownerId: dto.targetUserIds.length ? { in: dto.targetUserIds } : undefined,
        closeDate: {
          gte: new Date(dto.dateRangeFrom),
          lte: new Date(dto.dateRangeTo),
        },
      },
      select: { id: true, name: true, amount: true, closeDate: true, ownerId: true },
    });

    const task = await this.prisma.forecastUpdateTask.create({
      data: {
        tenantId,
        createdById,
        period: dto.period,
        title: dto.title,
        dueDate: new Date(dto.dueDate),
        targetUserIds: dto.targetUserIds as any,
        dateRangeFrom: new Date(dto.dateRangeFrom),
        dateRangeTo: new Date(dto.dateRangeTo),
        entries: {
          create: opps.map((o) => ({
            userId: o.ownerId,
            oppId: o.id,
            oppName: o.name,
            prevAmount: o.amount,
            prevCloseDate: o.closeDate,
          })),
        },
      },
      include: { entries: true },
    });
    return task;
  }

  async listUpdateTasks(tenantId: string, userId: string, isManager: boolean) {
    const where: any = { tenantId };
    if (!isManager) {
      // Reps only see tasks they are targeted in
      where.OR = [
        { createdById: userId },
        { targetUserIds: { array_contains: userId } },
      ];
    }
    return this.prisma.forecastUpdateTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        _count: { select: { entries: true } },
      },
    });
  }

  async getUpdateTask(tenantId: string, taskId: string, userId: string) {
    const task = await this.prisma.forecastUpdateTask.findFirst({
      where: { id: taskId, tenantId },
      include: {
        entries: {
          where: { userId },
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { oppName: 'asc' },
        },
      },
    });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    return task;
  }

  async submitUpdateTask(
    tenantId: string,
    taskId: string,
    userId: string,
    entries: Array<{
      oppId: string;
      noChange: boolean;
      newAmount?: number;
      newCloseDate?: string;
    }>,
  ) {
    const task = await this.prisma.forecastUpdateTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const e of entries) {
        // Upsert entry
        await tx.forecastUpdateEntry.upsert({
          where: { taskId_userId_oppId: { taskId, userId, oppId: e.oppId } },
          update: {
            noChange: e.noChange,
            newAmount: e.noChange ? undefined : e.newAmount,
            newCloseDate: e.noChange || !e.newCloseDate ? undefined : new Date(e.newCloseDate),
            submittedAt: now,
          },
          create: {
            taskId, userId, oppId: e.oppId, oppName: '',
            noChange: e.noChange,
            newAmount: e.noChange ? undefined : e.newAmount,
            newCloseDate: e.noChange || !e.newCloseDate ? undefined : new Date(e.newCloseDate),
            submittedAt: now,
          },
        });

        // Update the actual opportunity if changed
        if (!e.noChange) {
          const patch: any = {};
          if (e.newAmount !== undefined) patch.amount = e.newAmount;
          if (e.newCloseDate) patch.closeDate = new Date(e.newCloseDate);
          if (Object.keys(patch).length) {
            await tx.opportunity.updateMany({ where: { id: e.oppId, tenantId }, data: patch });
          }
        }
      }
    });

    // Auto-close task when all entries have been submitted
    const allEntries = await this.prisma.forecastUpdateEntry.findMany({
      where: { taskId },
      select: { submittedAt: true },
    });
    if (allEntries.length > 0 && allEntries.every((e) => e.submittedAt !== null)) {
      await this.prisma.forecastUpdateTask.update({
        where: { id: taskId },
        data: { status: 'closed' },
      });
    }

    return { ok: true, submitted: entries.length };
  }
}
