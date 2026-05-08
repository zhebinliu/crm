// ─── FieldHistoryController — admin viewer for field-level history (Wave 18b) ──
//
// GET /api/admin/records/:type/:id/field-history?field=closeDate
// Returns the change timeline (newest first) for a single record, optionally
// filtered to a single field. Locked behind the `admin.*` permission to match
// the audit-log viewer.

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FieldHistoryService } from './field-history.service';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { TenantId } from './decorators/current-user.decorator';
import { PermissionsGuard } from './guards/permissions.guard';

class FieldHistoryQuery {
  @IsOptional() @IsString() field?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
}

@UseGuards(PermissionsGuard)
@Controller('admin/records')
export class FieldHistoryController {
  constructor(private readonly svc: FieldHistoryService) {}

  @Get(':type/:id/field-history')
  @RequirePermissions('admin.*')
  list(
    @TenantId() tenantId: string,
    @Param('type') type: string,
    @Param('id') id: string,
    @Query() q: FieldHistoryQuery,
  ) {
    return this.svc.list(tenantId, type, id, q.field, q.take ?? 200);
  }
}
