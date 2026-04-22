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
    if (job.name === 'run-rule') {
      const { ruleId, ctx } = job.data as { ruleId: string; ctx: TriggerContext };
      try {
        const rule = await this.prisma.workflowRule.findUnique({ where: { id: ruleId } });
        if (!rule || !rule.isActive) return;
        await this.workflow.executeRule(rule, ctx);
      } catch (e) {
        this.log.error(`Workflow job ${job.id} failed: ${e instanceof Error ? e.message : e}`);
        throw e; // BullMQ will retry
      }
    }
  }
}
