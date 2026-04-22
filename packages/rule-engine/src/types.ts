// ─── Rule DSL ────────────────────────────────────────────────────────────────
// Rules are stored as JSON in DB so they can be edited at runtime.

export type Operator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_blank'
  | 'is_not_blank'
  | 'between'
  | 'matches_regex'
  // change-detection operators (compare current vs previous):
  | 'changed'
  | 'changed_to'
  | 'changed_from'
  | 'increased'
  | 'decreased';

export interface Condition {
  /** Dot-path into the record, or "$user.id", "$now", "$tenant.id". */
  field: string;
  op: Operator;
  /** Literal, or a path prefixed with "$" to reference another field/context value. */
  value?: unknown;
  /** Upper bound for `between`. */
  value2?: unknown;
}

export type ConditionNode = { all: ConditionNode[] } | { any: ConditionNode[] } | { not: ConditionNode } | Condition;

/** Context passed to the evaluator. */
export interface EvalContext {
  /** Current record state (after change). */
  record: Record<string, unknown>;
  /** Previous record state (before change); absent on create. */
  previous?: Record<string, unknown>;
  /** Currently-acting user info. */
  user?: { id: string; roles?: string[]; managerId?: string | null };
  tenant?: { id: string };
  /** Arbitrary extra context. */
  extra?: Record<string, unknown>;
}

export interface ActionDescriptor {
  /**
   * Action type — executor is resolved by the backend via an ActionRegistry.
   * Built-in types: field_update | create_task | send_webhook | send_email
   *               | submit_for_approval | emit_event | log
   */
  type: string;
  /** Params interpreted by the specific action executor. */
  params: Record<string, unknown>;
  /** Optional condition gating this individual action. */
  if?: ConditionNode;
}
