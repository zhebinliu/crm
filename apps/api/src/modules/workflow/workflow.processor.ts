import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WorkflowService, type TriggerContext } from './workflow.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('workflow')
export class WorkflowProcessor extends WorkerHost {
  private readonly log = new Logger(WorkflowProcessor.name);

  constructor(
    private readonly workflow: WorkflowService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // Wave 18b1: jobs are tagged with tenantId in `data.tenantId` and
    // (for newly enqueued jobs) named `run-rule:<tenantId>`. We accept
    // both the legacy `run-rule` name and the new prefixed form so
    // in-flight jobs at deploy time are still drained.
    if (job.name === 'run-rule' || job.name.startsWith('run-rule:')) {
      const { ruleId, ctx, tenantId } = job.data as {
        ruleId: string;
        ctx: TriggerContext;
        tenantId?: string;
      };
      const tenant = tenantId ?? ctx?.tenantId;
      try {
        const rule = await this.prisma.workflowRule.findUnique({ where: { id: ruleId } });
        if (!rule || !rule.isActive) return;
        await this.workflow.executeRule(rule, ctx);
      } catch (e) {
        this.log.error(
          `Workflow job ${job.id} (tenant=${tenant ?? 'unknown'}) failed: ${e instanceof Error ? e.message : e}`,
        );
        throw e; // BullMQ will retry
      }
    }
  }
}
