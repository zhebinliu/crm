import type { Condition, ConditionNode, EvalContext, Operator } from './types';
import { resolvePath, resolveValue } from './path';

export function evaluate(node: ConditionNode | undefined | null, ctx: EvalContext): boolean {
  // An empty/undefined condition tree is "match everything" — matches Salesforce default.
  if (node == null) return true;
  if (isEmpty(node)) return true;

  if ('all' in node) {
    return node.all.every((c) => evaluate(c, ctx));
  }
  if ('any' in node) {
    return node.any.some((c) => evaluate(c, ctx));
  }
  if ('not' in node) {
    return !evaluate(node.not, ctx);
  }
  return evalCondition(node, ctx);
}

function isEmpty(node: ConditionNode): boolean {
  if ('all' in node) return node.all.length === 0;
  if ('any' in node) return node.any.length === 0;
  return false;
}

function evalCondition(c: Condition, ctx: EvalContext): boolean {
  const actual = resolvePath(c.field, ctx);
  const expected = resolveValue(c.value, ctx);
  return applyOperator(c.op, actual, expected, resolveValue(c.value2, ctx), c, ctx);
}

function applyOperator(
  op: Operator,
  actual: unknown,
  expected: unknown,
  expected2: unknown,
  cond: Condition,
  ctx: EvalContext,
): boolean {
  switch (op) {
    case 'eq':
      return eq(actual, expected);
    case 'ne':
      return !eq(actual, expected);
    case 'gt':
      return cmp(actual, expected) > 0;
    case 'gte':
      return cmp(actual, expected) >= 0;
    case 'lt':
      return cmp(actual, expected) < 0;
    case 'lte':
      return cmp(actual, expected) <= 0;
    case 'in':
      return Array.isArray(expected) && expected.some((v) => eq(actual, v));
    case 'not_in':
      return Array.isArray(expected) && !expected.some((v) => eq(actual, v));
    case 'contains':
      if (Array.isArray(actual)) return actual.some((v) => eq(v, expected));
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'not_contains':
      if (Array.isArray(actual)) return !actual.some((v) => eq(v, expected));
      return !String(actual ?? '').includes(String(expected ?? ''));
    case 'starts_with':
      return String(actual ?? '').startsWith(String(expected ?? ''));
    case 'ends_with':
      return String(actual ?? '').endsWith(String(expected ?? ''));
    case 'is_blank':
      return isBlank(actual);
    case 'is_not_blank':
      return !isBlank(actual);
    case 'between':
      return cmp(actual, expected) >= 0 && cmp(actual, expected2) <= 0;
    case 'matches_regex':
      try {
        const re = new RegExp(String(expected));
        return re.test(String(actual ?? ''));
      } catch {
        return false;
      }
    case 'changed': {
      if (!ctx.previous) return true; // create: treat as changed
      const prev = resolvePath(`$previous.${cond.field.replace(/^\$previous\./, '')}`, ctx);
      return !eq(actual, prev);
    }
    case 'changed_to': {
      if (!ctx.previous) return eq(actual, expected);
      const prev = resolvePath(`$previous.${cond.field}`, ctx);
      return !eq(actual, prev) && eq(actual, expected);
    }
    case 'changed_from': {
      if (!ctx.previous) return false;
      const prev = resolvePath(`$previous.${cond.field}`, ctx);
      return !eq(actual, prev) && eq(prev, expected);
    }
    case 'increased': {
      if (!ctx.previous) return false;
      const prev = resolvePath(`$previous.${cond.field}`, ctx);
      return cmp(actual, prev) > 0;
    }
    case 'decreased': {
      if (!ctx.previous) return false;
      const prev = resolvePath(`$previous.${cond.field}`, ctx);
      return cmp(actual, prev) < 0;
    }
    default:
      return false;
  }
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date) {
    return toTime(a) === toTime(b);
  }
  // Decimal-ish: Prisma Decimal objects have toString()
  if (typeof a === 'object' && a !== null && 'toString' in a && typeof b !== 'object') {
    return (a as { toString(): string }).toString() === String(b);
  }
  return false;
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date || b instanceof Date) {
    return toTime(a) - toTime(b);
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const an = Number(a as number);
  const bn = Number(b as number);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}

function toTime(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? 0 : t;
}
