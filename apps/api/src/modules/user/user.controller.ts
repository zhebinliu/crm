import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() displayName!: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() department?: string;
  @IsString() @IsOptional() managerId?: string;
  @IsOptional() roleCodes?: string[];
}

class UpdateUserDto {
  @IsString() @IsOptional() displayName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() department?: string;
  @IsOptional() managerId?: string | null;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsOptional() roleCodes?: string[];
}

@ApiTags('admin')
@Controller('admin/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermissions('user.read')
  list(@TenantId() tid: string, @Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.users.list(tid, {
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('user.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.users.get(tid, id);
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreateUserDto) {
    return this.users.create(tid, dto);
  }

  @Put(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tid, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.users.softDelete(tid, id);
  }
}
