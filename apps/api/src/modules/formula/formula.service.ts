// ─── FormulaService ──────────────────────────────────────────────────────
// Thin wrapper around @tokenwave/rule-engine's compileFormula() exposing:
//   • evaluate(formula, record)  — single-shot
//   • decorateRecord(objectApiName, record) — looks up formulaExpr columns
//     via FieldDef table and adds computed values to the result object
//
// Closes audit P2b. Formula fields are now actually computed instead of
// stored-but-never-evaluated.

import { Injectable, Logger } from '@nestjs/common';
import { evaluateFormula, type FormulaValue, FormulaError } from '@tokenwave/rule-engine';
import { PrismaService } from '../../prisma/prisma.service';

interface FormulaFieldDef {
  apiName: string;
  formulaExpr: string;
}

@Injectable()
export class FormulaService {
  private readonly log = new Logger(FormulaService.name);
  private readonly fieldsCache = new Map<string, { value: FormulaFieldDef[]; expires: number }>();

  constructor(private readonly prisma: PrismaService) {}

  evaluate(formula: string, record: Record<string, unknown>): { value: FormulaValue; error?: string } {
    try {
      return { value: evaluateFormula(formula, record) };
    } catch (e) {
      const msg = e instanceof FormulaError ? e.message : (e as Error).message;
      return { value: null, error: msg };
    }
  }

  /**
   * Add computed formula values to a record in-place. Returns the same
   * record reference for chaining. Errors per-field are stored as
   * `__formulaErrors[apiName]` so the UI can show diagnostics without
   * blowing up the whole record fetch.
   */
  async decorateRecord(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const formulas = await this.formulaFieldsFor(tenantId, objectApiName);
    if (formulas.length === 0) return record;
    const errors: Record<string, string> = {};
    for (const f of formulas) {
      try {
        record[f.apiName] = evaluateFormula(f.formulaExpr, record);
      } catch (e) {
        errors[f.apiName] = e instanceof FormulaError ? e.message : (e as Error).message;
        record[f.apiName] = null;
      }
    }
    if (Object.keys(errors).length > 0) record.__formulaErrors = errors;
    return record;
  }

  /** Same but for an array (list pages). */
  async decorateRecords(
    tenantId: string,
    objectApiName: string,
    records: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const formulas = await this.formulaFieldsFor(tenantId, objectApiName);
    if (formulas.length === 0) return records;
    for (const r of records) {
      for (const f of formulas) {
        try { r[f.apiName] = evaluateFormula(f.formulaExpr, r); }
        catch { r[f.apiName] = null; }
      }
    }
    return records;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async formulaFieldsFor(tenantId: string, objectApiName: string): Promise<FormulaFieldDef[]> {
    const cacheKey = `${tenantId}:${objectApiName.toLowerCase()}`;
    const cached = this.fieldsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;

    const obj = await this.prisma.objectDef.findFirst({
      where: { tenantId, apiName: objectApiName.toLowerCase() },
      select: { id: true },
    });
    if (!obj) {
      this.fieldsCache.set(cacheKey, { value: [], expires: Date.now() + 60_000 });
      return [];
    }
    const rows = await this.prisma.fieldDef.findMany({
      where: { tenantId, objectId: obj.id, type: 'FORMULA' },
      select: { apiName: true, formulaExpr: true },
    });
    const valid = rows
      .filter((r): r is { apiName: string; formulaExpr: string } => !!r.formulaExpr)
      .map((r) => ({ apiName: r.apiName, formulaExpr: r.formulaExpr }));
    this.fieldsCache.set(cacheKey, { value: valid, expires: Date.now() + 60_000 });
    return valid;
  }

  /** Invalidate the cache after metadata changes. */
  invalidate(tenantId: string, objectApiName: string): void {
    this.fieldsCache.delete(`${tenantId}:${objectApiName.toLowerCase()}`);
  }
}
