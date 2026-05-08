// Attached to every authenticated request by the Jwt strategy and tenant middleware.
export interface RequestUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];        // role codes
  permissions: string[];  // flattened permission codes
  managerId?: string | null;
  // Set by ApiKeyAuthMiddleware. When true, this request was authenticated
  // by a machine-to-machine API key, not a user JWT. JwtAuthGuard skips
  // its own verification when this is set.
  isApiKey?: boolean;
  apiKeyId?: string;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
    tenantId?: string;
  }
}
