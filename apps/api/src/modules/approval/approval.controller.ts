import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApprovalService } from './approval.service';
import { TenantId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ApprovalRequestStatus, ApproverSource, ApprovalStepMode } from '@prisma/client';
import type { RequestUser } from '../../common/types/request-context';

class SubmitDto {
  @IsString() objectApiName!: string;
  @IsString() recordId!: string;
  @IsString() @IsOptional() comment?: string;
}

class ActionDto {
  @IsString() @IsOptional() comment?: string;
}

class StepDto {
  @IsNumber() order!: number;
  @IsString() name!: string;
  @IsOptional() entryCondition?: unknown;
  @IsEnum(ApproverSource) approverSource!: ApproverSource;
  approverConfig!: unknown;
  @IsEnum(ApprovalStepMode) @IsOptional() mode?: ApprovalStepMode;
  @IsString() @IsOptional() rejectBehavior?: string;
}

class CreateProcessDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() objectApiName!: string;
  @IsOptional() entryCriteria?: unknown;
  @IsArray() @IsOptional() finalApproveActions?: unknown[];
  @IsArray() @IsOptional() finalRejectActions?: unknown[];
  @IsBoolean() @IsOptional() lockOnSubmit?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsNumber() @IsOptional() priority?: number;
  @IsArray() steps!: StepDto[];
}

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly svc: ApprovalService) {}

  // Processes (admin)
  @Get('processes')
  @RequirePermissions('approval.approve')
  listProcesses(@TenantId() tid: string, @Query('objectApiName') obj?: string) {
    return this.svc.listProcesses(tid, obj);
  }

  @Post('processes')
  @RequirePermissions('admin.*')
  createProcess(@TenantId() tid: string, @Body() dto: CreateProcessDto) {
    return this.svc.createProcess(tid, dto);
  }

  @Get('processes/:id')
  @RequirePermissions('approval.approve')
  getProcess(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.getProcess(tid, id);
  }

  @Put('processes/:id')
  @RequirePermissions('admin.*')
  updateProcess(@TenantId() tid: string, @Param('id') id: string, @Body() dto: Partial<CreateProcessDto>) {
    return this.svc.updateProcess(tid, id, dto);
  }

  @Delete('processes/:id')
  @RequirePermissions('admin.*')
  deleteProcess(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.deleteProcess(tid, id);
  }

  // Requests
  @Get('requests')
  @RequirePermissions('approval.approve')
  listRequests(
    @TenantId() tid: string,
    @CurrentUser() user: RequestUser,
    @Query('mine') mine?: string,
    @Query('status') status?: string,
    @Query('recordType') recordType?: string,
  ) {
    return this.svc.listRequests(tid, {
      status: status as ApprovalRequestStatus | undefined,
      recordType,
      assigneeId: mine === 'true' ? user.id : undefined,
    });
  }

  @Post('submit')
  @RequirePermissions('approval.approve')
  submit(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Body() dto: SubmitDto) {
    return this.svc.submit(tid, user.id, dto.objectApiName, dto.recordId, dto.comment);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('approval.approve')
  approve(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ActionDto) {
    return this.svc.approve(tid, user.id, id, dto.comment);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('approval.approve')
  reject(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ActionDto) {
    return this.svc.reject(tid, user.id, id, dto.comment);
  }

  @Post('requests/:id/recall')
  @RequirePermissions('approval.approve')
  recall(@TenantId() tid: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ActionDto) {
    return this.svc.recall(tid, user.id, id, dto.comment);
  }
}
