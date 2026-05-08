// ─── Report REST endpoints (Wave 19a) ──────────────────────────────────────

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
import {
  ReportService,
  type ReportConfig,
  type ReportFilter,
} from './report.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class CreateReportDto {
  @IsString() reportTypeId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(['tabular', 'summary', 'matrix']) format?: 'tabular' | 'summary' | 'matrix';
  config!: ReportConfig;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() @MaxLength(60) folderName?: string;
}

class UpdateReportDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsIn(['tabular', 'summary', 'matrix']) format?: 'tabular' | 'summary' | 'matrix';
  @IsOptional() config?: ReportConfig;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() folderName?: string | null;
}

class RunReportDto {
  @IsOptional() @IsArray() runtimeFilters?: ReportFilter[];
}

class RunAdHocDto {
  @IsString() baseObject!: string;
  config!: ReportConfig;
}

class CreateReportTypeDto {
  @IsString() @MaxLength(80) apiName!: string;
  @IsString() @MaxLength(120) label!: string;
  @IsString() baseObject!: string;
  @IsOptional() @IsArray() joins?: Array<{ object: string; foreignKey: string; alias: string }>;
  @IsOptional() @IsArray() availableColumns?: string[];
  @IsOptional() @IsBoolean() isStandard?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller()
export class ReportController {
  constructor(private readonly svc: ReportService) {}

  // ── Reports ──────────────────────────────────────────────────────────────

  @Get('reports')
  @RequirePermissions('report.read')
  list(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    return this.svc.list(tenantId, user.id);
  }

  @Post('reports')
  @RequirePermissions('report.write')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateReportDto,
  ) {
    return this.svc.create(tenantId, user.id, body);
  }

  @Get('reports/:id')
  @RequirePermissions('report.read')
  get(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.get(tenantId, user.id, id);
  }

  @Put('reports/:id')
  @RequirePermissions('report.write')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UpdateReportDto,
  ) {
    return this.svc.update(tenantId, user.id, id, body);
  }

  @Delete('reports/:id')
  @RequirePermissions('report.write')
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.delete(tenantId, user.id, id);
  }

  @Post('reports/:id/run')
  @RequirePermissions('report.read')
  run(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: RunReportDto,
  ) {
    return this.svc.runReport(tenantId, id, body.runtimeFilters);
  }

  @Post('reports/run-adhoc')
  @RequirePermissions('report.read')
  runAdHoc(@TenantId() tenantId: string, @Body() body: RunAdHocDto) {
    return this.svc.runAdHoc(tenantId, body.baseObject, body.config);
  }

  // ── Report Types ─────────────────────────────────────────────────────────

  @Get('report-types')
  @RequirePermissions('report.read')
  listReportTypes(@TenantId() tenantId: string) {
    return this.svc.listReportTypes(tenantId);
  }

  @Post('admin/report-types')
  @RequirePermissions('admin.*')
  createReportType(
    @TenantId() tenantId: string,
    @Body() body: CreateReportTypeDto,
  ) {
    return this.svc.createReportType(tenantId, body);
  }
}
