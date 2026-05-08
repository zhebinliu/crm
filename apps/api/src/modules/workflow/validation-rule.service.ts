import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluate, type ConditionNode } from '@tokenwave/rule-engine';
import type { EvalContext } from '@tokenwave/rule-engine';

export interface ValidationError {
  field?: string;
  message: string;
}

@Injectable()
export class ValidationRuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all active validation rules for an object. When a rule's condition
   * evaluates TRUE the save is BLOCKED (Salesforce semantics).
   *
   * Throws BadRequestException if any rule fires.
   */
  async validate(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
    previous?: Record<string, unknown>,
    user?: { id: string; roles?: string[] },
  ): Promise<void> {
    const rules = await this.prisma.validationRule.findMany({
      where: { tenantId, objectApiName, isActive: true },
      orderBy: { priority: 'asc' },
    });

    const ctx: EvalContext = {
      record,
      previous,
      user,
      tenant: { id: tenantId },
    };

    const errors: ValidationError[] = [];
    for (const rule of rules) {
      const fires = evaluate(rule.conditions as ConditionNode, ctx);
      if (fires) {
        errors.push({ field: rule.errorField ?? undefined, message: rule.errorMessage });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Validation failed', errors });
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  list(tenantId: string, objectApiName?: string) {
    return this.prisma.validationRule.findMany({
      where: { tenantId, ...(objectApiName ? { objectApiName } : {}) },
      orderBy: [{ objectApiName: 'asc' }, { priority: 'asc' }],
    });
  }

  /** Paginated variant for the GraphQL resolver. */
  async listPaginated(
    tenantId: string,
    opts: { objectApiName?: string; skip?: number; take?: number } = {},
  ) {
    const { objectApiName, skip, take } = opts;
    const where = { tenantId, ...(objectApiName ? { objectApiName } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.validationRule.findMany({
        where,
        orderBy: [{ objectApiName: 'asc' }, { priority: 'asc' }],
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
      }),
      this.prisma.validationRule.count({ where }),
    ]);
    return { data, total };
  }

  get(tenantId: string, id: string) {
    return this.prisma.validationRule.findFirstOrThrow({ where: { id, tenantId } });
  }

  create(tenantId: string, data: {
    name: string; description?: string; objectApiName: string;
    conditions: unknown; errorMessage: string; errorField?: string;
    isActive?: boolean; priority?: number;
  }) {
    return this.prisma.validationRule.create({
      data: { tenantId, ...data, conditions: data.conditions as object },
    });
  }

  update(tenantId: string, id: string, data: Partial<Parameters<typeof this.create>[1]>) {
    return this.prisma.validationRule.update({
      where: { id },
      data: { ...data, conditions: data.conditions ? (data.conditions as object) : undefined },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.validationRule.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Soft-delete by toggling `isActive` to false. ValidationRule has no
   * `deletedAt` column, so we deactivate instead.
   */
  async softDelete(tenantId: string, id: string) {
    await this.prisma.validationRule.update({
      where: { id, tenantId },
      data: { isActive: false },
    });
    return { ok: true };
  }
}
