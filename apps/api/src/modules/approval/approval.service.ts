import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluate, type ConditionNode } from '@tokenwave/rule-engine';
import {
  ApprovalRequestStatus,
  ApprovalActionType,
  ApproverSource,
  ApprovalStepMode,
  WorkflowTrigger,
} from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { AuditService } from '../workflow/audit.service';
import { RecordMutatorService } from '../workflow/record-mutator.service';
import { EVENTS } from '@tokenwave/shared';

@Injectable()
export class ApprovalService {
  private readonly log = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
    private readonly audit: AuditService,
    private readonly mutator: RecordMutatorService,
  ) {}

  // ── Process CRUD ──────────────────────────────────────────────────────────

  listProcesses(tenantId: string, objectApiName?: string) {
    return this.prisma.approvalProcess.findMany({
      where: { tenantId, ...(objectApiName ? { objectApiName } : {}) },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: [{ objectApiName: 'asc' }, { priority: 'asc' }],
    });
  }

  getProcess(tenantId: string, id: string) {
    return this.prisma.approvalProcess.findFirstOrThrow({
      where: { id, tenantId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  createProcess(tenantId: string, data: {
    name: string; description?: string; objectApiName: string;
    entryCriteria?: unknown; finalApproveActions?: unknown[];
    finalRejectActions?: unknown[]; lockOnSubmit?: boolean;
    isActive?: boolean; priority?: number;
    steps: Array<{
      order: number; name: string; entryCondition?: unknown;
      approverSource: ApproverSource; approverConfig: unknown;
      mode?: ApprovalStepMode; rejectBehavior?: string;
    }>;
  }) {
    const { steps, ...rest } = data;
    return this.prisma.approvalProcess.create({
      data: {
        tenantId,
        ...rest,
        entryCriteria: (rest.entryCriteria ?? {}) as object,
        finalApproveActions: (rest.finalApproveActions ?? []) as object[],
        finalRejectActions: (rest.finalRejectActions ?? []) as object[],
        steps: { create: steps.map((s) => ({ ...s, entryCondition: s.entryCondition as object | undefined, approverConfig: s.approverConfig as InputJsonValue })) },
      },
      include: { steps: true },
    });
  }

  async updateProcess(tenantId: string, id: string, data: {
    name?: string; description?: string; isActive?: boolean; priority?: number;
    entryCriteria?: unknown; finalApproveActions?: unknown[]; finalRejectActions?: unknown[];
    steps?: Array<{ order: number; name: string; approverSource: ApproverSource; approverConfig: unknown; mode?: ApprovalStepMode; rejectBehavior?: string }>;
  }) {
    const { steps, ...rest } = data;
    if (steps) {
      await this.prisma.approvalStep.deleteMany({ where: { processId: id } });
      await this.prisma.approvalStep.createMany({
        data: steps.map((s) => ({ ...s, processId: id, approverConfig: s.approverConfig as InputJsonValue })),
      });
    }
    return this.prisma.approvalProcess.update({
      where: { id, tenantId },
      data: { ...rest, entryCriteria: rest.entryCriteria as object | undefined },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  async deleteProcess(tenantId: string, id: string) {
    await this.prisma.approvalStep.deleteMany({ where: { processId: id } });
    return this.prisma.approvalProcess.delete({ where: { id, tenantId } });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async submit(tenantId: string, submitterId: string, objectApiName: string, recordId: string, comment?: string): Promise<string> {
    // Find matching active process
    const record = await this.mutator.findById(objectApiName, tenantId, recordId);
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Record not found' });

    const processes = await this.prisma.approvalProcess.findMany({
      where: { tenantId, objectApiName, isActive: true },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { priority: 'asc' },
    });

    const evalCtx = {
      record: record as Record<string, unknown>,
      user: { id: submitterId },
      tenant: { id: tenantId },
    };

    const process = processes.find((p) =>
      evaluate(p.entryCriteria as ConditionNode, evalCtx),
    );
    if (!process) {
      throw new BadRequestException({ code: 'BAD_TRANSITION', message: 'No approval process matches this record' });
    }

    // Check for open request
    const existing = await this.prisma.approvalRequest.findFirst({
      where: { tenantId, recordType: objectApiName, recordId, status: ApprovalRequestStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException({ code: 'CONFLICT', message: 'An open approval request already exists' });
    }

    const firstStep = process.steps[0];
    if (!firstStep) throw new BadRequestException({ code: 'BAD_TRANSITION', message: 'Process has no steps' });

    const assigneeIds = await this.resolveAssignees(tenantId, firstStep, submitterId, record as Record<string, unknown>);

    const request = await this.prisma.approvalRequest.create({
      data: {
        tenantId,
        processId: process.id,
        recordType: objectApiName,
        recordId,
        submitterId,
        status: ApprovalRequestStatus.PENDING,
        currentStepId: firstStep.id,
        currentStepOrder: firstStep.order,
        currentAssigneeIds: assigneeIds,
        comments: comment,
        actions: {
          create: {
            stepOrder: firstStep.order,
            actorId: submitterId,
            action: ApprovalActionType.SUBMIT,
            comment,
          },
        },
      },
    });

    if (process.lockOnSubmit) {
      await this.mutator.updateFields(objectApiName, tenantId, recordId, { _approvalLocked: true });
    }

    this.emitter.emit(EVENTS.APPROVAL_SUBMITTED, { tenantId, requestId: request.id, recordType: objectApiName, recordId });
    await this.audit.log({ tenantId, actorId: submitterId, action: 'submit_for_approval', recordType: objectApiName, recordId });

    return request.id;
  }

  // ── Approve / Reject / Recall ────────────────────────────────────────────

  async approve(tenantId: string, actorId: string, requestId: string, comment?: string): Promise<void> {
    const req = await this.loadRequest(tenantId, requestId);
    this.assertCanAct(req, actorId);

    const process = await this.getProcess(tenantId, req.processId);

    await this.prisma.approvalAction.create({
      data: { requestId, stepOrder: req.currentStepOrder!, actorId, action: ApprovalActionType.APPROVE, comment },
    });

    // In PARALLEL_ALL/SEQUENTIAL, check if all approvers have approved.
    const step = process.steps.find((s) => s.id === req.currentStepId)!;
    if (step.mode === ApprovalStepMode.PARALLEL_ALL) {
      const approved = await this.prisma.approvalAction.findMany({
        where: { requestId, stepOrder: req.currentStepOrder!, action: ApprovalActionType.APPROVE },
      });
      const remaining = req.currentAssigneeIds.filter((id) => !approved.some((a) => a.actorId === id));
      if (remaining.length > 0) {
        // More approvers needed at this step
        return;
      }
    }

    // Advance to next step or finalize
    const nextStep = process.steps.find((s) => s.order === (req.currentStepOrder ?? 0) + 1);
    if (nextStep) {
      const assigneeIds = await this.resolveAssignees(tenantId, nextStep, req.submitterId, {});
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { currentStepId: nextStep.id, currentStepOrder: nextStep.order, currentAssigneeIds: assigneeIds },
      });
      this.emitter.emit(EVENTS.APPROVAL_STEP_APPROVED, { tenantId, requestId, stepOrder: req.currentStepOrder });
    } else {
      await this.finalize(tenantId, req, process, true);
    }
  }

  async reject(tenantId: string, actorId: string, requestId: string, comment?: string): Promise<void> {
    const req = await this.loadRequest(tenantId, requestId);
    this.assertCanAct(req, actorId);

    await this.prisma.approvalAction.create({
      data: { requestId, stepOrder: req.currentStepOrder!, actorId, action: ApprovalActionType.REJECT, comment },
    });

    const process = await this.getProcess(tenantId, req.processId);
    const step = process.steps.find((s) => s.id === req.currentStepId)!;

    if (step.rejectBehavior === 'restart') {
      // Restart from step 1
      const firstStep = process.steps[0]!;
      const assigneeIds = await this.resolveAssignees(tenantId, firstStep, req.submitterId, {});
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { currentStepId: firstStep.id, currentStepOrder: firstStep.order, currentAssigneeIds: assigneeIds },
      });
    } else {
      await this.finalize(tenantId, req, process, false);
    }
  }

  async recall(tenantId: string, actorId: string, requestId: string, comment?: string): Promise<void> {
    const req = await this.loadRequest(tenantId, requestId);
    if (req.submitterId !== actorId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the submitter can recall' });
    }
    const process = await this.getProcess(tenantId, req.processId);

    await this.prisma.approvalAction.create({
      data: { requestId, actorId, action: ApprovalActionType.RECALL, comment },
    });
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: ApprovalRequestStatus.RECALLED, finalizedAt: new Date() },
    });

    if (process.lockOnSubmit) {
      await this.mutator.updateFields(req.recordType, tenantId, req.recordId, { _approvalLocked: false });
    }
    this.emitter.emit(EVENTS.APPROVAL_RECALLED, { tenantId, requestId });
  }

  // ── Auto-submit via event (from workflow action) ──────────────────────────

  @OnEvent('approval.auto_submit')
  async onAutoSubmit(event: { tenantId: string; submitterId: string; objectApiName: string; recordId: string }) {
    try {
      await this.submit(event.tenantId, event.submitterId, event.objectApiName, event.recordId);
    } catch (e) {
      this.log.warn(`Auto submit failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────

  private async finalize(
    tenantId: string,
    req: Awaited<ReturnType<typeof this.loadRequest>>,
    process: Awaited<ReturnType<typeof this.getProcess>>,
    approved: boolean,
  ) {
    const status = approved ? ApprovalRequestStatus.APPROVED : ApprovalRequestStatus.REJECTED;
    await this.prisma.approvalRequest.update({
      where: { id: req.id },
      data: { status, finalizedAt: new Date() },
    });

    if (process.lockOnSubmit) {
      await this.mutator.updateFields(req.recordType, tenantId, req.recordId, { _approvalLocked: false });
    }

    const actions = approved ? process.finalApproveActions : process.finalRejectActions;
    // Execute final actions via basic field update (actions are field_update-style only for now)
    for (const action of actions as Array<{ type: string; params: Record<string, unknown> }>) {
      if (action.type === 'field_update' && action.params?.fields) {
        await this.mutator.updateFields(
          req.recordType,
          tenantId,
          req.recordId,
          action.params.fields as Record<string, unknown>,
        );
      }
    }

    const event = approved ? EVENTS.APPROVAL_FINALIZED : EVENTS.APPROVAL_REJECTED;
    this.emitter.emit(event, { tenantId, requestId: req.id, approved });
    await this.audit.log({
      tenantId,
      action: approved ? 'approval_approved' : 'approval_rejected',
      recordType: req.recordType,
      recordId: req.recordId,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadRequest(tenantId: string, requestId: string) {
    const req = await this.prisma.approvalRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!req) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval request not found' });
    if (req.status !== ApprovalRequestStatus.PENDING) {
      throw new BadRequestException({ code: 'BAD_TRANSITION', message: `Request is already ${req.status}` });
    }
    return req;
  }

  private assertCanAct(req: { currentAssigneeIds: string[] }, actorId: string) {
    if (!req.currentAssigneeIds.includes(actorId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not an assigned approver for the current step' });
    }
  }

  private async resolveAssignees(
    tenantId: string,
    step: { approverSource: ApproverSource; approverConfig: unknown },
    submitterId: string,
    record: Record<string, unknown>,
  ): Promise<string[]> {
    const cfg = step.approverConfig as Record<string, unknown>;
    switch (step.approverSource) {
      case ApproverSource.USER:
        return [cfg['userId'] as string];
      case ApproverSource.ROLE: {
        const roleCode = cfg['roleCode'] as string;
        const ur = await this.prisma.userRole.findMany({
          where: { role: { tenantId, code: roleCode } },
          include: { user: { select: { id: true, isActive: true } } },
        });
        return ur.filter((r) => r.user.isActive).map((r) => r.userId);
      }
      case ApproverSource.MANAGER: {
        const levels = Number(cfg['levels'] ?? 1);
        const ids: string[] = [];
        let current = submitterId;
        for (let i = 0; i < levels; i++) {
          const u = await this.prisma.user.findUnique({ where: { id: current } });
          if (!u?.managerId) break;
          ids.push(u.managerId);
          current = u.managerId;
        }
        return ids;
      }
      case ApproverSource.FIELD: {
        const fieldPath = cfg['fieldPath'] as string;
        const parts = fieldPath.split('.');
        let val: unknown = record;
        for (const p of parts) {
          val = (val as Record<string, unknown>)?.[p];
        }
        return val ? [String(val)] : [];
      }
      default:
        return [];
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  listRequests(tenantId: string, opts?: { status?: ApprovalRequestStatus; recordType?: string; assigneeId?: string }) {
    return this.prisma.approvalRequest.findMany({
      where: {
        tenantId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.recordType ? { recordType: opts.recordType } : {}),
        ...(opts?.assigneeId ? { currentAssigneeIds: { has: opts.assigneeId } } : {}),
      },
      include: { actions: { orderBy: { createdAt: 'asc' }, include: { actor: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
