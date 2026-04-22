import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@tokenwave/shared';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Mark a controller handler (or GraphQL resolver method) as requiring
 * one or more permission codes. PermissionsGuard enforces them.
 */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, codes);
