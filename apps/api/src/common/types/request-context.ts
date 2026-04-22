// Attached to every authenticated request by the Jwt strategy and tenant middleware.
export interface RequestUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];        // role codes
  permissions: string[];  // flattened permission codes
  managerId?: string | null;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
    tenantId?: string;
  }
}
