// ─── Permission catalog ─────────────────────────────────────────────────────
// Format: "<object>.<action>"
// "*" means all actions on object; "admin.*" is super-admin.

export const ACTIONS = ['read', 'write', 'delete', 'convert', 'approve', '*'] as const;
export type PermissionAction = (typeof ACTIONS)[number];

export const OBJECTS = [
  'lead',
  'account',
  'contact',
  'opportunity',
  'product',
  'pricebook',
  'quote',
  'order',
  'contract',
  'activity',
  'note',
  'attachment',
  'report',
  'admin',
  'workflow',
  'approval',
  'metadata',
  'user',
  'role',
] as const;
export type PermissionObject = (typeof OBJECTS)[number];

export type PermissionCode = `${PermissionObject}.${PermissionAction}`;

export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  APPROVER: 'approver',
  READ_ONLY: 'read_only',
} as const;

// Default permissions per system role — seed bootstraps these.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  admin: ['admin.*'],
  sales_manager: [
    'lead.*',
    'account.*',
    'contact.*',
    'opportunity.*',
    'quote.*',
    'order.*',
    'contract.read',
    'contract.write',
    'product.read',
    'pricebook.read',
    'activity.*',
    'report.read',
    'approval.approve',
    'user.read',
  ],
  sales_rep: [
    'lead.read',
    'lead.write',
    'lead.convert',
    'account.read',
    'account.write',
    'contact.read',
    'contact.write',
    'opportunity.read',
    'opportunity.write',
    'quote.read',
    'quote.write',
    'order.read',
    'product.read',
    'pricebook.read',
    'activity.*',
  ],
  approver: ['approval.approve', 'opportunity.read', 'quote.read', 'order.read', 'contract.read'],
  read_only: [
    'lead.read',
    'account.read',
    'contact.read',
    'opportunity.read',
    'quote.read',
    'order.read',
    'contract.read',
    'product.read',
    'activity.read',
  ],
};

export function hasPermission(granted: string[], required: PermissionCode): boolean {
  if (granted.includes('admin.*')) return true;
  if (granted.includes(required)) return true;
  const [obj] = required.split('.');
  return granted.includes(`${obj}.*`);
}
