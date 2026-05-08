// REST surface for Public Groups (admin-only).

import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PublicGroupService } from './public-group.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class CreateGroupDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateGroupDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class AddMemberDto {
  @IsOptional() @IsString() userId?: string | null;
  @IsOptional() @IsString() roleId?: string | null;
}

@UseGuards(PermissionsGuard)
@Controller('admin/public-groups')
export class PublicGroupController {
  constructor(private readonly svc: PublicGroupService) {}

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
  create(@TenantId() tid: string, @Body() dto: CreateGroupDto) {
    return this.svc.create(tid, dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.svc.update(tid, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }

  @Post(':id/members')
  @RequirePermissions('admin.*')
  addMember(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.svc.addMember(tid, id, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  removeMember(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.svc.removeMember(tid, id, memberId);
  }
}
