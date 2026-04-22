// Domain error codes — consumed by the API layer to produce consistent responses.

export const ERR = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  RECORD_LOCKED: 'RECORD_LOCKED',
  WORKFLOW_FAILED: 'WORKFLOW_FAILED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  BAD_TRANSITION: 'BAD_TRANSITION',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TENANT_INACTIVE: 'TENANT_INACTIVE',
} as const;

export type ErrorCode = (typeof ERR)[keyof typeof ERR];

export interface ApiError {
  code: ErrorCode;
  message: string;
  field?: string;
  details?: unknown;
}
