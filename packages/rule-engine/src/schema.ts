import { z } from 'zod';

const OperatorSchema = z.enum([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'is_blank', 'is_not_blank',
  'between', 'matches_regex',
  'changed', 'changed_to', 'changed_from', 'increased', 'decreased',
]);

const ConditionSchema = z.object({
  field: z.string().min(1),
  op: OperatorSchema,
  value: z.unknown().optional(),
  value2: z.unknown().optional(),
});

type NodeShape = { all?: NodeShape[]; any?: NodeShape[]; not?: NodeShape } | z.infer<typeof ConditionSchema>;

export const ConditionNodeSchema: z.ZodType<NodeShape> = z.lazy(() =>
  z.union([
    ConditionSchema,
    z.object({ all: z.array(ConditionNodeSchema) }),
    z.object({ any: z.array(ConditionNodeSchema) }),
    z.object({ not: ConditionNodeSchema }),
  ]),
);

export const ActionDescriptorSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  if: ConditionNodeSchema.optional(),
});

export const WorkflowRulePayloadSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  objectApiName: z.string().min(1),
  trigger: z.enum(['ON_CREATE', 'ON_UPDATE', 'ON_FIELD_CHANGE', 'ON_DELETE', 'SCHEDULED', 'MANUAL']),
  watchFields: z.array(z.string()).default([]),
  conditions: ConditionNodeSchema.optional(),
  actions: z.array(ActionDescriptorSchema).min(1),
  cronExpr: z.string().optional(),
  runSync: z.boolean().default(false),
  priority: z.number().int().default(100),
  isActive: z.boolean().default(true),
  runOnceFlag: z.boolean().default(false),
});

export const ValidationRulePayloadSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  objectApiName: z.string().min(1),
  conditions: ConditionNodeSchema,
  errorMessage: z.string().min(1),
  errorField: z.string().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(100),
});
