import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from './workflow.service';
import { WorkflowTrigger } from '@prisma/client';
import { RecordMutatorService } from './record-mutator.service';

/**
 * Polls DB every minute and fires SCHEDULED workflow rules whose cron expression
 * matches the current minute. We use a simple cron-string-to-should-run check
 * rather than a full cron library to avoid dependency weight.
 */
@Injectable()
export class WorkflowCronService {
  private readonly log = new Logger(WorkflowCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly mutator: RecordMutatorService,
  ) {}

  @Cron('* * * * *')
  async runScheduled(): Promise<void> {
    const rules = await this.prisma.workflowRule.findMany({
      where: { trigger: WorkflowTrigger.SCHEDULED, isActive: true },
    });
    for (const rule of rules) {
      if (!rule.cronExpr || !matchesCron(rule.cronExpr)) continue;
      try {
        // For scheduled rules, we query matching records and trigger on each.
        const records = await this.getTargetRecords(rule.tenantId, rule.objectApiName);
        for (const record of records) {
          await this.workflow.executeRule(rule, {
            tenantId: rule.tenantId,
            objectApiName: rule.objectApiName,
            trigger: WorkflowTrigger.SCHEDULED,
            record: record as Record<string, unknown>,
          });
        }
      } catch (e) {
        this.log.error(`Scheduled rule ${rule.id} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  private async getTargetRecords(tenantId: string, objectApiName: string) {
    // Return active/open records to iterate over.
    const delegate = (this.prisma as unknown as Record<string, { findMany: Function }>)[
      objectModelMap[objectApiName] ?? objectApiName
    ];
    if (!delegate) return [];
    return delegate.findMany({ where: { tenantId, deletedAt: null }, take: 500 });
  }
}

const objectModelMap: Record<string, string> = {
  lead: 'lead',
  account: 'account',
  contact: 'contact',
  opportunity: 'opportunity',
  quote: 'quote',
  order: 'order',
  contract: 'contract',
};

/**
 * Minimal cron expression checker (standard 5-field, no seconds).
 * Returns true if the current UTC time matches the expression.
 */
function matchesCron(expr: string): boolean {
  const now = new Date();
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  const checks = [
    [now.getUTCMinutes(), min],
    [now.getUTCHours(), hour],
    [now.getUTCDate(), dom],
    [now.getUTCMonth() + 1, month],
    [now.getUTCDay(), dow],
  ] as [number, string][];
  return checks.every(([val, field]) => fieldMatches(val, field));
}

function fieldMatches(val: number, field: string): boolean {
  if (field === '*') return true;
  if (field.includes('/')) {
    const [, step] = field.split('/');
    return val % Number(step) === 0;
  }
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number);
    return val >= lo! && val <= hi!;
  }
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(val);
  }
  return Number(field) === val;
}
