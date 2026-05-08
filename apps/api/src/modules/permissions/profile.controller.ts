// ─── ProfileController (Wave 19d) ─────────────────────────────────────────
// Admin REST surface for Profiles. All mutations gated by `admin.*`.

import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class CreateProfileDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsString() @IsOptional() description?: string;
  @IsObject() @IsOptional() objectCrud?: Record<string, unknown>;
  @IsObject() @IsOptional() fieldPerms?: Record<string, unknown>;
  @IsArray() @IsOptional() systemPerms?: string[];
}

class UpdateProfileDto {
  @IsString() @IsOptional() apiName?: string;
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() description?: string;
  @IsObject() @IsOptional() objectCrud?: Record<string, unknown>;
  @IsObject() @IsOptional() fieldPerms?: Record<string, unknown>;
  @IsArray() @IsOptional() systemPerms?: string[];
  @IsBoolean() @IsOptional() isActive?: boolean;
}

class AssignUserDto {
  @IsString() userId!: string;
}

@ApiTags('admin')
@UseGuards(PermissionsGuard)
@Controller('admin/profiles')
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

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
  create(@TenantId() tid: string, @Body() dto: CreateProfileDto) {
    return this.svc.create(tid, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.svc.update(tid, id, dto as never);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }

  @Post(':id/assign-user')
  @RequirePermissions('admin.*')
  assignUser(@TenantId() tid: string, @Param('id') id: string, @Body() dto: AssignUserDto) {
    return this.svc.assignToUser(tid, dto.userId, id);
  }
}
