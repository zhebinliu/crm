// ─── AssignmentEngineService ─────────────────────────────────────────────
// Evaluates TerritoryAssignmentRule predicates against an Account record and
// (re-)writes AccountTerritory rows. Manual assignments are sticky — only
// `source = "auto"` rows are touched here.
//
// A rule's `conditions` field is a JSON array of `{ field, op, value }`
// records, combined with `matchType` ("all" → AND, "any" → OR). Supported
// operators (intentionally small):
//   =  !=  in  not_in  >=  <=  contains  starts_with
//
// On a tie in priority, ALL matching territories at that priority win — sales
// ops generally want "this account is in 华东 AND a named-account program",
// not "first one wins, the rest get dropped".

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type RuleOp =
  | '='
  | '!='
  | 'in'
  | 'not_in'
  | '>='
  | '<='
  | 'contains'
  | 'starts_with';

export interface RuleCondition {
  field: string;
  op: RuleOp;
  value: unknown;
}

@Injectable()
export class AssignmentEngineService {
  private readonly log = new Logger(AssignmentEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all active rules in priority order (lowest first → wins). Returns the
   * set of territory IDs the account should be auto-assigned to.
   */
  async evaluateRules(tenantId: string, account: Record<string, unknown>): Promise<string[]> {
    const rules = await this.prisma.territoryAssignmentRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const matched = new Set<string>();
    let lastWinningPriority: number | null = null;
    for (const rule of rules) {
      // The first priority "tier" with a match wins. Once we've taken a tier,
      // skip strictly lower-priority tiers (higher number).
      if (lastWinningPriority !== null && rule.priority > lastWinningPriority) break;
      const conditions = this.normalizeConditions(rule.conditions);
      if (this.matches(account, conditions, rule.matchType)) {
        matched.add(rule.territoryId);
        lastWinningPriority = rule.priority;
      }
    }
    return Array.from(matched);
  }

  /**
   * Hook from AccountService.create / update. Removes prior auto-assignments
   * that no longer match and creates new ones for the freshly-evaluated set.
   * Manual assignments are preserved.
   */
  async applyOnAccountWrite(tenantId: string, account: Record<string, unknown>): Promise<void> {
    const accountId = String(account['id']);
    if (!accountId) return;
    const territoryIds = await this.evaluateRules(tenantId, account);

    // Drop prior `auto` rows that aren't in the new set.
    await this.prisma.accountTerritory.deleteMany({
      where: {
        tenantId,
        accountId,
        source: 'auto',
        territoryId: { notIn: territoryIds.length > 0 ? territoryIds : ['__none__'] },
      },
    });

    // Insert new auto rows. Manual rows for the same (account,territory)
    // pair are preserved untouched — we only insert when no row exists. The
    // tenant-guard middleware blocks upsert without tenantId in the where
    // clause, so we do find-then-create.
    for (const tid of territoryIds) {
      const existing = await this.prisma.accountTerritory.findFirst({
        where: { tenantId, accountId, territoryId: tid },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.accountTerritory.create({
        data: {
          tenantId,
          accountId,
          territoryId: tid,
          source: 'auto',
          isPrimary: false,
        },
      });
    }
  }

  /** Bulk re-run across every Account in tenant. Admin-only. */
  async runForAllAccounts(tenantId: string): Promise<{ scanned: number; touched: number }> {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, deletedAt: null },
      take: 10_000, // cap so we don't OOM; real impl would page
    });
    let touched = 0;
    for (const a of accounts) {
      try {
        await this.applyOnAccountWrite(tenantId, a as unknown as Record<string, unknown>);
        touched += 1;
      } catch (e) {
        this.log.warn(
          `applyOnAccountWrite failed for account=${a.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return { scanned: accounts.length, touched };
  }

  // ── Predicate evaluator ────────────────────────────────────────────────────

  private normalizeConditions(raw: unknown): RuleCondition[] {
    if (!Array.isArray(raw)) return [];
    const out: RuleCondition[] = [];
    for (const r of raw) {
      if (r && typeof r === 'object' && 'field' in r && 'op' in r) {
        out.push(r as RuleCondition);
      }
    }
    return out;
  }

  private matches(record: Record<string, unknown>, conditions: RuleCondition[], matchType: string): boolean {
    if (conditions.length === 0) return false;
    const evaluator = (c: RuleCondition) => this.evalCondition(record, c);
    return matchType === 'any' ? conditions.some(evaluator) : conditions.every(evaluator);
  }

  private evalCondition(record: Record<string, unknown>, c: RuleCondition): boolean {
    const lhs = this.readField(record, c.field);
    const rhs = c.value;
    switch (c.op) {
      case '=':
        return lhs === rhs;
      case '!=':
        return lhs !== rhs;
      case 'in':
        return Array.isArray(rhs) && rhs.includes(lhs as never);
      case 'not_in':
        return Array.isArray(rhs) && !rhs.includes(lhs as never);
      case '>=':
        return typeof lhs === 'number' && typeof rhs === 'number' && lhs >= rhs;
      case '<=':
        return typeof lhs === 'number' && typeof rhs === 'number' && lhs <= rhs;
      case 'contains':
        return typeof lhs === 'string' && typeof rhs === 'string' && lhs.includes(rhs);
      case 'starts_with':
        return typeof lhs === 'string' && typeof rhs === 'string' && lhs.startsWith(rhs);
      default:
        return false;
    }
  }

  private readField(record: Record<string, unknown>, path: string): unknown {
    if (path.includes('.')) {
      // Support `customFields.foo` style. Two-deep is enough for now.
      const parts = path.split('.');
      let cursor: unknown = record;
      for (const p of parts) {
        if (cursor && typeof cursor === 'object' && p in (cursor as Record<string, unknown>)) {
          cursor = (cursor as Record<string, unknown>)[p];
        } else {
          return undefined;
        }
      }
      return cursor;
    }
    return record[path];
  }
}
