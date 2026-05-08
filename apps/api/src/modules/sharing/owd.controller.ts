// REST surface for Org-Wide Defaults (admin-only).
//   GET    /api/admin/owd                     — list all per-object OWDs
//   GET    /api/admin/owd/:objectApiName      — get one (with default fallback)
//   PUT    /api/admin/owd/:objectApiName      — upsert

import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { OrgWideDefaultsService } from './owd.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class UpsertOwdDto {
  @IsIn(['private', 'public_read', 'public_read_write']) internalSharing!:
    | 'private'
    | 'public_read'
    | 'public_read_write';
  @IsOptional() @IsString() externalSharing?: string | null;
  @IsBoolean() grantHierarchy!: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('admin/owd')
export class OrgWideDefaultsController {
  constructor(private readonly svc: OrgWideDefaultsService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string) {
    return this.svc.list(tid);
  }

  @Get(':objectApiName')
  @RequirePermissions('admin.*')
  get(@TenantId() tid: string, @Param('objectApiName') name: string) {
    return this.svc.get(tid, name);
  }

  @Put(':objectApiName')
  @RequirePermissions('admin.*')
  set(
    @TenantId() tid: string,
    @Param('objectApiName') name: string,
    @Body() dto: UpsertOwdDto,
  ) {
    return this.svc.set(tid, name, dto);
  }
}
