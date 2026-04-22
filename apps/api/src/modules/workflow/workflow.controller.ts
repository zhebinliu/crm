import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { WorkflowService } from './workflow.service';
import { AuditService } from './audit.service';
import { TenantId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { WorkflowTrigger } from '@prisma/client';
import type { RequestUser } from '../../common/types/request-context';

class CreateRuleDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() objectApiName!: string;
  @IsEnum(WorkflowTrigger) trigger!: WorkflowTrigger;
  @IsArray() @IsOptional() watchFields?: string[];
  @IsOptional() conditions?: unknown;
  @IsArray() actions!: unknown[];
  @IsString() @IsOptional() cronExpr?: string;
  @IsBoolean() @IsOptional() runSync?: boolean;
  @IsNumber() @IsOptional() priority?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() runOnceFlag?: boolean;
}

@ApiTags('admin')
@Controller('admin/workflow-rules')
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('workflow.read')
  list(@TenantId() tid: string, @Query('objectApiName') obj?: string) {
    return this.workflow.list(tid, obj);
  }

  @Get('executions')
  @RequirePermissions('workflow.read')
  executions(
    @TenantId() tid: string,
    @Query('ruleId') ruleId?: string,
    @Query('recordId') recordId?: string,
  ) {
    return this.workflow.executionHistory(tid, ruleId, recordId);
  }

  @Get('audit-log')
  @RequirePermissions('workflow.read')
  auditLog(
    @TenantId() tid: string,
    @Query('recordType') recordType?: string,
    @Query('recordId') recordId?: string,
  ) {
    return this.audit.list(tid, recordType, recordId);
  }

  @Get(':id')
  @RequirePermissions('workflow.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.workflow.get(tid, id);
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Body() dto: CreateRuleDto) {
    return this.workflow.create(tid, user.id, dto);
  }

  @Put(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: Partial<CreateRuleDto>) {
    return this.workflow.update(tid, id, user.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.workflow.remove(tid, id);
  }
}
