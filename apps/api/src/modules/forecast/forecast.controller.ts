import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ForecastService } from './forecast.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

class GetTargetQuery {
  @IsString() period!: string;
  @IsOptional() @IsString() userId?: string;
}

class UpsertTargetDto {
  @IsString() period!: string;
  @IsOptional() @IsString() userId?: string;
  @Type(() => Number) @IsNumber() @Min(0) quota!: number;
}

class UpsertConfigDto {
  @IsOptional() categories?: Record<string, string>;
  @IsOptional() @IsString() objectApiName?: string;
  @IsOptional() @IsString() amountField?: string;
  @IsOptional() @IsString() dateField?: string;
  @IsOptional() @IsString() stageField?: string;
  @IsOptional() @IsString() ownerField?: string;
}

class CreateTaskDto {
  @IsString() period!: string;
  @IsString() title!: string;
  @IsDateString() dueDate!: string;
  @IsArray() targetUserIds!: string[];
  @IsDateString() dateRangeFrom!: string;
  @IsDateString() dateRangeTo!: string;
}

class SubmitEntryDto {
  @IsString() oppId!: string;
  @IsString() oppName!: string;
  noChange!: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() newAmount?: number;
  @IsOptional() @IsString() newCloseDate?: string;
}

class SubmitTaskDto {
  @IsArray() entries!: SubmitEntryDto[];
}

// ── Controller ───────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('forecasts')
export class ForecastController {
  constructor(private readonly service: ForecastService) {}

  // ── Targets ───────────────────────────────────────────────────────────────

  @Get('targets')
  @RequirePermissions('opportunity.read')
  getTarget(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Query() q: GetTargetQuery) {
    return this.service.getTarget(tenantId, q.userId ?? user.id, q.period);
  }

  @Get('targets/team')
  @RequirePermissions('opportunity.read')
  listTargets(@TenantId() tenantId: string, @Query('period') period: string) {
    return this.service.listTargets(tenantId, period);
  }

  @Put('targets')
  @RequirePermissions('opportunity.write')
  upsertTarget(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() body: UpsertTargetDto) {
    return this.service.upsertTarget(tenantId, body.userId ?? user.id, body.period, body.quota);
  }

  // ── Config (F2 + F3) ──────────────────────────────────────────────────────

  @Get('config')
  @RequirePermissions('opportunity.read')
  getConfig(@TenantId() tenantId: string) {
    return this.service.getConfig(tenantId);
  }

  @Put('config')
  @RequirePermissions('opportunity.write')
  upsertConfig(@TenantId() tenantId: string, @Body() body: UpsertConfigDto) {
    return this.service.upsertConfig(tenantId, body);
  }

  // ── Update tasks (F4) ─────────────────────────────────────────────────────

  @Post('update-tasks')
  @RequirePermissions('opportunity.write')
  createTask(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() body: CreateTaskDto) {
    return this.service.createUpdateTask(tenantId, user.id, body);
  }

  @Get('update-tasks')
  @RequirePermissions('opportunity.read')
  listTasks(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    const isManager =
      user.roles?.includes('admin') ||
      user.roles?.includes('sales_manager') ||
      user.roles?.some((r: any) => typeof r === 'object' && ['admin','sales_manager'].includes(r.role?.code));
    return this.service.listUpdateTasks(tenantId, user.id, !!isManager);
  }

  @Get('update-tasks/:id')
  @RequirePermissions('opportunity.read')
  getTask(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.getUpdateTask(tenantId, id, user.id);
  }

  @Post('update-tasks/:id/submit')
  @RequirePermissions('opportunity.write')
  submitTask(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: SubmitTaskDto,
  ) {
    return this.service.submitUpdateTask(tenantId, id, user.id, body.entries);
  }
}
