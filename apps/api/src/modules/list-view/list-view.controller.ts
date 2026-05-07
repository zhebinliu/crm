import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListViewService } from './list-view.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class CreateListViewDto {
  @IsString() @MaxLength(60) objectApiName!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() filters?: Record<string, unknown>;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
  @IsOptional() @IsBoolean() isShared?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class UpdateListViewDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() filters?: Record<string, unknown>;
  @IsOptional() @IsString() sortBy?: string | null;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc' | null;
  @IsOptional() @IsBoolean() isShared?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('list-views')
export class ListViewController {
  constructor(private readonly svc: ListViewService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Query('objectApiName') objectApiName: string,
  ) {
    return this.svc.listForUser(tenantId, user.id, objectApiName);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateListViewDto,
  ) {
    return this.svc.create(tenantId, user.id, {
      objectApiName: body.objectApiName,
      name: body.name,
      filters: body.filters ?? {},
      sortBy: body.sortBy ?? null,
      sortDir: body.sortDir ?? null,
      isShared: body.isShared,
      isDefault: body.isDefault,
    });
  }

  @Put(':id')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UpdateListViewDto,
  ) {
    return this.svc.update(tenantId, user.id, id, body);
  }

  @Delete(':id')
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.remove(tenantId, user.id, id);
  }
}
