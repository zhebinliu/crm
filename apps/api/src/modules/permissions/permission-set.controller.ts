// ─── PermissionSetController (Wave 19d) ──────────────────────────────────
// Admin REST surface for Permission Sets + the per-user `me/permissions`
// debug endpoint. All mutations gated by `admin.*`.

import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsDateString, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { PermissionSetService } from './permission-set.service';
import { PermissionResolverService } from './permission-resolver.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class CreatePermSetDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsString() @IsOptional() description?: string;
  @IsObject() @IsOptional() objectCrud?: Record<string, unknown>;
  @IsObject() @IsOptional() fieldPerms?: Record<string, unknown>;
  @IsArray() @IsOptional() systemPerms?: string[];
  @IsBoolean() @IsOptional() isActive?: boolean;
}

class UpdatePermSetDto {
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() description?: string;
  @IsObject() @IsOptional() objectCrud?: Record<string, unknown>;
  @IsObject() @IsOptional() fieldPerms?: Record<string, unknown>;
  @IsArray() @IsOptional() systemPerms?: string[];
  @IsBoolean() @IsOptional() isActive?: boolean;
}

class AssignUserDto {
  @IsString() userId!: string;
  @IsDateString() @IsOptional() expiresAt?: string;
}

@ApiTags('admin')
@UseGuards(PermissionsGuard)
@Controller('admin/permission-sets')
export class PermissionSetController {
  constructor(private readonly svc: PermissionSetService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string) {
    return this.svc.list(tid);
  }

  @Get(':id')
  @RequirePermissions('admin.*')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreatePermSetDto) {
    return this.svc.create(tid, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdatePermSetDto) {
    return this.svc.update(tid, id, dto as never);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }

  @Post(':id/assign-user')
  @RequirePermissions('admin.*')
  assignUser(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.assignToUser(tid, dto.userId, id, {
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      assignedById: user.id,
    });
  }

  @Delete(':id/assign-user/:userId')
  @RequirePermissions('admin.*')
  revokeUser(@TenantId() tid: string, @Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.revokeFromUser(tid, userId, id);
  }
}

@ApiTags('me')
@UseGuards(PermissionsGuard)
@Controller('me')
export class MePermissionsController {
  constructor(private readonly resolver: PermissionResolverService) {}

  /** Debug: returns the resolved permissions for the current user. */
  @Get('permissions')
  resolved(@CurrentUser() user: RequestUser) {
    return this.resolver.resolveForUser(user.id);
  }
}
