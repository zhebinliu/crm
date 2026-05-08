// ─── Dashboard REST endpoints (Wave 19a) ───────────────────────────────────

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DashboardService, type Visualization } from './dashboard.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class CreateDashboardDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() layout?: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

class UpdateDashboardDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsArray() layout?: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

class AddComponentDto {
  @IsString() reportId!: string;
  @IsOptional() @IsIn(['table', 'bar', 'line', 'pie', 'metric', 'donut'])
  visualization?: Visualization;
  @IsString() @MaxLength(120) title!: string;
  @IsOptional() options?: Record<string, unknown>;
  @IsOptional() position?: { x: number; y: number; w: number; h: number };
}

@UseGuards(PermissionsGuard)
@Controller('dashboards')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  list(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    return this.svc.list(tenantId, user.id);
  }

  @Post()
  @RequirePermissions('dashboard.write')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateDashboardDto,
  ) {
    return this.svc.create(tenantId, user.id, body);
  }

  @Get(':id')
  @RequirePermissions('dashboard.read')
  get(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.get(tenantId, user.id, id);
  }

  @Put(':id')
  @RequirePermissions('dashboard.write')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UpdateDashboardDto,
  ) {
    return this.svc.update(tenantId, user.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions('dashboard.write')
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.delete(tenantId, user.id, id);
  }

  @Get(':id/run')
  @RequirePermissions('dashboard.read')
  run(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.runDashboard(tenantId, user.id, id);
  }

  // ── Component management ─────────────────────────────────────────────────

  @Post(':id/components')
  @RequirePermissions('dashboard.write')
  addComponent(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: AddComponentDto,
  ) {
    return this.svc.addComponent(tenantId, user.id, id, body);
  }

  @Delete(':id/components/:componentId')
  @RequirePermissions('dashboard.write')
  removeComponent(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('componentId') componentId: string,
  ) {
    return this.svc.removeComponent(tenantId, user.id, id, componentId);
  }
}
