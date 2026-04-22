import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluator';

const ctx = (record: Record<string, unknown>, previous?: Record<string, unknown>) => ({
  record,
  previous,
  user: { id: 'u1', roles: ['sales_rep'] },
  tenant: { id: 't1' },
});

describe('evaluator', () => {
  it('matches empty conditions', () => {
    expect(evaluate({ all: [] }, ctx({}))).toBe(true);
    expect(evaluate(null, ctx({}))).toBe(true);
  });

  it('evaluates eq on flat record', () => {
    expect(evaluate({ field: 'stage', op: 'eq', value: 'closed_won' }, ctx({ stage: 'closed_won' }))).toBe(true);
    expect(evaluate({ field: 'stage', op: 'eq', value: 'closed_won' }, ctx({ stage: 'prospecting' }))).toBe(false);
  });

  it('supports nested all/any', () => {
    const rule = {
      all: [
        { field: 'stage', op: 'eq' as const, value: 'negotiation' },
        { any: [
          { field: 'amount', op: 'gte' as const, value: 100000 },
          { field: 'rating', op: 'eq' as const, value: 'hot' },
        ] },
      ],
    };
    expect(evaluate(rule, ctx({ stage: 'negotiation', amount: 150000, rating: 'cold' }))).toBe(true);
    expect(evaluate(rule, ctx({ stage: 'negotiation', amount: 50000, rating: 'hot' }))).toBe(true);
    expect(evaluate(rule, ctx({ stage: 'negotiation', amount: 50000, rating: 'cold' }))).toBe(false);
    expect(evaluate(rule, ctx({ stage: 'proposal', amount: 200000, rating: 'hot' }))).toBe(false);
  });

  it('supports not', () => {
    expect(evaluate({ not: { field: 'isClosed', op: 'eq', value: true } }, ctx({ isClosed: false }))).toBe(true);
  });

  it('detects changed_to', () => {
    const rule = { field: 'stage', op: 'changed_to' as const, value: 'closed_won' };
    expect(evaluate(rule, ctx({ stage: 'closed_won' }, { stage: 'negotiation' }))).toBe(true);
    expect(evaluate(rule, ctx({ stage: 'closed_won' }, { stage: 'closed_won' }))).toBe(false);
    expect(evaluate(rule, ctx({ stage: 'negotiation' }, { stage: 'proposal' }))).toBe(false);
  });

  it('resolves nested paths', () => {
    const rule = { field: 'account.industry', op: 'eq' as const, value: 'finance' };
    expect(evaluate(rule, ctx({ account: { industry: 'finance' } }))).toBe(true);
  });

  it('handles between and in', () => {
    expect(evaluate({ field: 'score', op: 'between', value: 50, value2: 80 }, ctx({ score: 65 }))).toBe(true);
    expect(evaluate({ field: 'score', op: 'between', value: 50, value2: 80 }, ctx({ score: 90 }))).toBe(false);
    expect(evaluate({ field: 'status', op: 'in', value: ['qualified', 'converted'] }, ctx({ status: 'qualified' }))).toBe(true);
  });
});
