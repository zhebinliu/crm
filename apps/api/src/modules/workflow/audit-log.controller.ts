// ─── /admin/audit-log ─────────────────────────────────────────────────────
// Read-only viewer over the AuditLog table. Tenant-scoped, admin-only.
// Powers the /admin/audit-log page in the web app.

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuditService } from './audit.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class ListAuditQuery {
  @IsOptional() @IsString() recordType?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() since?: string;
  @IsOptional() @IsString() until?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

@UseGuards(PermissionsGuard)
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string, @Query() q: ListAuditQuery) {
    return this.audit.listForAdmin(tid, q);
  }

  @Get('facets')
  @RequirePermissions('admin.*')
  facets(@TenantId() tid: string) {
    return this.audit.filterFacets(tid);
  }
}
