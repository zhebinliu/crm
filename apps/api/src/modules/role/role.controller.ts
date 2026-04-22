import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreateRoleDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsString() @IsOptional() description?: string;
  @IsArray() @IsOptional() permissionCodes?: string[];
}

class UpdatePermissionsDto {
  @IsArray() permissionCodes!: string[];
}

@ApiTags('admin')
@Controller('admin/roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string) {
    return this.roles.list(tid);
  }

  @Get('permissions')
  @RequirePermissions('admin.*')
  permissions() {
    return this.roles.listPermissions();
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreateRoleDto) {
    return this.roles.create(tid, dto);
  }

  @Put(':id/permissions')
  @RequirePermissions('admin.*')
  updatePermissions(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdatePermissionsDto) {
    return this.roles.updatePermissions(tid, id, dto.permissionCodes);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.roles.remove(tid, id);
  }
}
