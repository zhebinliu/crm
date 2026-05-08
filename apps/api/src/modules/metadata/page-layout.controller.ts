import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { PageLayoutService } from './page-layout.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreatePageLayoutDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsArray() @IsOptional() sections?: unknown[];
  @IsBoolean() @IsOptional() isActive?: boolean;
}

class UpdatePageLayoutDto {
  @IsString() @IsOptional() label?: string;
  @IsArray() @IsOptional() sections?: unknown[];
  @IsBoolean() @IsOptional() isActive?: boolean;
}

@ApiTags('admin')
@Controller('admin/metadata/objects/:objectApiName/page-layouts')
export class PageLayoutController {
  constructor(private readonly svc: PageLayoutService) {}

  @Get()
  @RequirePermissions('metadata.read')
  list(@TenantId() tid: string, @Param('objectApiName') obj: string) {
    return this.svc.list(tid, obj);
  }

  @Get('resolve')
  @RequirePermissions('metadata.read')
  resolve(
    @TenantId() tid: string,
    @Param('objectApiName') obj: string,
    @Query('recordTypeId') recordTypeId?: string,
  ) {
    return this.svc.resolve(tid, obj, recordTypeId || null);
  }

  @Get(':layoutId')
  @RequirePermissions('metadata.read')
  get(@TenantId() tid: string, @Param('layoutId') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('metadata.write')
  create(
    @TenantId() tid: string,
    @Param('objectApiName') obj: string,
    @Body() dto: CreatePageLayoutDto,
  ) {
    return this.svc.create(tid, obj, dto);
  }

  @Patch(':layoutId')
  @RequirePermissions('metadata.write')
  update(
    @TenantId() tid: string,
    @Param('layoutId') id: string,
    @Body() dto: UpdatePageLayoutDto,
  ) {
    return this.svc.update(tid, id, dto);
  }

  @Delete(':layoutId')
  @RequirePermissions('metadata.write')
  remove(@TenantId() tid: string, @Param('layoutId') id: string) {
    return this.svc.remove(tid, id);
  }
}
