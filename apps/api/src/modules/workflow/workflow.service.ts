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
        // Wave 18b1: tag jobs with tenantId so per-tenant fairness can be
        // enforced downstream (rate-limiting, observability, future
        // per-tenant queue split). The processor reads `data.tenantId`.
        // Job name is also prefixed with the tenant for easy log filtering.
        await this.queue.add(
          `run-rule:${ctx.tenantId}`,
          { tenantId: ctx.tenantId, ruleId: rule.id, ctx },
          { priority: rule.priority },
        );
      }
    }
  }

  /** Execute a single rule synchronously (conditions → actions). */
  async executeRule(
    rule: { id: string; conditions: unknown; actions: unknown },
    ctx: TriggerContext,
  ): Promise<void> {
    const startedAt = Date.now();
    // Capture the active OTel trace context at rule-execution time. Passed
    // through `extra.traceparent` so SendWebhookAction can forward it as
    // an HTTP header → receiving system can continue the same trace.
    let traceparent: string | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const otel = require('@opentelemetry/api');
      const span = otel.trace?.getSpan?.(otel.context?.active?.());
      const sc = span?.spanContext?.();
      if (sc?.traceId && sc?.spanId) {
        const flags = (sc.traceFlags ?? 0).toString(16).padStart(2, '0');
        traceparent = `00-${sc.traceId}-${sc.spanId}-${flags}`;
      }
    } catch {
      // OTel optional
    }

    const evalCtx: EvalContext = {
      record: ctx.record,
      previous: ctx.previous,
      user: ctx.user ? { id: ctx.user.id, roles: ctx.user.roles, managerId: ctx.user.managerId } : undefined,
      tenant: { id: ctx.tenantId },
      extra: {
        objectApiName: ctx.objectApiName,
        recordId: ctx.record['id'] as string,
        event: ctx.trigger,
        ...(traceparent ? { traceparent } : {}),
      },
    };

    // Evaluate the rule's condition tree; an empty/missing tree is treated as
    // "always run" to preserve historical behavior.
    const conditionsMet = rule.conditions
      ? evaluate(rule.conditions as ConditionNode, evalCtx)
      : true;

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

  /** Paginated variant for the GraphQL resolver (same WHERE shape as `list`). */
  async listPaginated(
    tenantId: string,
    opts: { objectApiName?: string; skip?: number; take?: number } = {},
  ) {
    const { objectApiName, skip, take } = opts;
    const where = { tenantId, ...(objectApiName ? { objectApiName } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.workflowRule.findMany({
        where,
        orderBy: [{ objectApiName: 'asc' }, { priority: 'asc' }],
        include: { _count: { select: { executions: true } } },
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
      }),
      this.prisma.workflowRule.count({ where }),
    ]);
    return { data, total };
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

  /**
   * Soft-delete by toggling `isActive` to false. WorkflowRule has no
   * `deletedAt` column, so we deactivate instead — matches the
   * "rule is no longer in effect" semantics callers expect.
   */
  async softDelete(tenantId: string, id: string) {
    await this.prisma.workflowRule.update({
      where: { id, tenantId },
      data: { isActive: false },
    });
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
