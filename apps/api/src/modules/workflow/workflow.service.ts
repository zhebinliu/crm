import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluate, type ActionRegistry, type ConditionNode, type EvalContext } from '@tokenwave/rule-engine';
import { WorkflowTrigger, WorkflowStatus } from '@prisma/client';
import { ACTION_REGISTRY } from './actions/actions.module';
import type { RequestUser } from '../../common/types/request-context';

export interface TriggerContext {
  tenantId: string;
  objectApiName: string;
  trigger: WorkflowTrigger;
  record: Record<string, unknown>;
  previous?: Record<string, unknown>;
  user?: RequestUser;
}

@Injectable()
export class WorkflowService {
  private readonly log = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
    @InjectQueue('workflow') private readonly queue: Queue,
    @Inject(ACTION_REGISTRY) private readonly registry: ActionRegistry,
  ) {}

  /**
   * Main entry-point called by every entity service after a create/update.
   * 1. Loads active workflow rules for the object + trigger.
   * 2. Runs sync rules inline; queues async rules.
   */
  async trigger(ctx: TriggerContext): Promise<void> {
    const rules = await this.prisma.workflowRule.findMany({
      where: {
        tenantId: ctx.tenantId,
        objectApiName: ctx.objectApiName,
        isActive: true,
        trigger: ctx.trigger,
      },
      orderBy: { priority: 'asc' },
    });

    for (const rule of rules) {
      // For ON_FIELD_CHANGE: only proceed if one of the watched fields changed.
      if (rule.trigger === WorkflowTrigger.ON_FIELD_CHANGE && rule.watchFields.length > 0) {
        const changed = rule.watchFields.some(
          (f) => ctx.previous && ctx.record[f] !== ctx.previous[f],
        );
        if (!changed) continue;
      }

      if (rule.runSync) {
        await this.executeRule(rule, ctx);
      } else {
        await this.queue.add('run-rule', { ruleId: rule.id, ctx }, { priority: rule.priority });
      }
    }
  }

  /** Execute a single rule synchronously (conditions → actions). */
  async executeRule(
    rule: { id: string; conditions: unknown; actions: unknown },
    ctx: TriggerContext,
  ): Promise<void> {
    const startedAt = Date.now();
    const evalCtx: EvalContext = {
      record: ctx.record,
      previous: ctx.previous,
      user: ctx.user ? { id: ctx.user.id, roles: ctx.user.roles, managerId: ctx.user.managerId } : undefined,
      tenant: { id: ctx.tenantId },
      extra: {
        objectApiName: ctx.objectApiName,
        recordId: ctx.record['id'] as string,
        event: ctx.trigger,
      },
    };

    if (!conditionsMet) {
      await this.persistExecution(rule.id, ctx, WorkflowStatus.SKIPPED, false, [], undefined, startedAt);
      return;
    }

    const actionsLog = await this.registry.runAll(
      rule.actions as Parameters<ActionRegistry['runAll']>[0],
      evalCtx,
    );

    const hasError = actionsLog.some((l) => !l.ok);
    await this.persistExecution(
      rule.id,
      ctx,
      hasError ? WorkflowStatus.PARTIAL : WorkflowStatus.SUCCESS,
      true,
      actionsLog,
      undefined,
      startedAt,
    );
  }

  private async persistExecution(
    ruleId: string,
    ctx: TriggerContext,
    status: WorkflowStatus,
    conditionsResult: boolean,
    actionsLog: unknown[],
    error?: string,
    startedAt?: number,
  ) {
    await this.prisma.workflowExecution.create({
      data: {
        ruleId,
        tenantId: ctx.tenantId,
        recordType: ctx.objectApiName,
        recordId: ctx.record['id'] as string,
        trigger: ctx.trigger,
        status,
        conditionsResult,
        actionsLog: actionsLog as object[],
        error,
        durationMs: startedAt ? Date.now() - startedAt : null,
        finishedAt: new Date(),
      },
    });
  }

  // ── CRUD for workflow rules ─────────────────────────────────────────────

  list(tenantId: string, objectApiName?: string) {
    return this.prisma.workflowRule.findMany({
      where: { tenantId, ...(objectApiName ? { objectApiName } : {}) },
      orderBy: [{ objectApiName: 'asc' }, { priority: 'asc' }],
      include: { _count: { select: { executions: true } } },
    });
  }

  get(tenantId: string, id: string) {
    return this.prisma.workflowRule.findFirstOrThrow({ where: { id, tenantId } });
  }

  create(tenantId: string, createdById: string, data: {
    name: string; description?: string; objectApiName: string;
    trigger: WorkflowTrigger; watchFields?: string[];
    conditions?: unknown; actions: unknown[];
    cronExpr?: string; runSync?: boolean;
    priority?: number; isActive?: boolean; runOnceFlag?: boolean;
  }) {
    return this.prisma.workflowRule.create({
      data: { tenantId, createdById, ...data, conditions: (data.conditions ?? {}) as object, actions: data.actions as object[] },
    });
  }

  update(tenantId: string, id: string, updatedById: string, data: Partial<Parameters<typeof this.create>[2]>) {
    return this.prisma.workflowRule.update({
      where: { id },
      data: {
        ...data,
        conditions: data.conditions ? (data.conditions as object) : undefined,
        actions: data.actions ? (data.actions as object[]) : undefined,
        updatedById,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.workflowRule.delete({ where: { id } });
    return { ok: true };
  }

  executionHistory(tenantId: string, ruleId?: string, recordId?: string) {
    return this.prisma.workflowExecution.findMany({
      where: {
        tenantId,
        ...(ruleId ? { ruleId } : {}),
        ...(recordId ? { recordId } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }
}
