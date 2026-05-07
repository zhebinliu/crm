import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignService } from './campaign.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';
import type { CampaignMemberStatus } from '@prisma/client';

const CAMPAIGN_TYPES = ['EMAIL', 'EVENT', 'WEBINAR', 'AD', 'REFERRAL', 'CONTENT', 'OTHER'];
const CAMPAIGN_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'ABORTED'];
const MEMBER_STATUSES = ['SENT', 'RECEIVED', 'OPENED', 'CLICKED', 'RESPONDED', 'CONVERTED', 'UNSUBSCRIBED', 'BOUNCED'];

class ListCampaignsQuery {
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: string;
  @IsOptional() @IsIn(CAMPAIGN_TYPES) type?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
}

class CreateCampaignDto {
  @IsString() name!: string;
  @IsOptional() @IsIn(CAMPAIGN_TYPES) type?: string;
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() budgetedCost?: number;
  @IsOptional() @IsNumber() actualCost?: number;
  @IsOptional() @IsNumber() expectedRevenue?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() ownerId?: string;
}

class UpdateCampaignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(CAMPAIGN_TYPES) type?: string;
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() budgetedCost?: number;
  @IsOptional() @IsNumber() actualCost?: number;
  @IsOptional() @IsNumber() expectedRevenue?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() ownerId?: string;
}

class AddMemberDto {
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsIn(MEMBER_STATUSES) status?: string;
}

class UpdateMemberStatusDto {
  @IsIn(MEMBER_STATUSES) status!: string;
}

@UseGuards(PermissionsGuard)
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly svc: CampaignService) {}

  @Get()
  @RequirePermissions('campaign.read')
  list(@TenantId() tid: string, @Query() q: ListCampaignsQuery) { return this.svc.list(tid, q); }

  @Get(':id')
  @RequirePermissions('campaign.read')
  get(@TenantId() tid: string, @Param('id') id: string) { return this.svc.get(tid, id); }

  @Post()
  @RequirePermissions('campaign.write')
  create(@TenantId() tid: string, @Body() body: CreateCampaignDto, @CurrentUser() user: RequestUser) {
    return this.svc.create(tid, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('campaign.write')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() body: UpdateCampaignDto, @CurrentUser() user: RequestUser) {
    return this.svc.update(tid, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('campaign.delete')
  remove(@TenantId() tid: string, @Param('id') id: string) { return this.svc.softDelete(tid, id); }

  // Members
  @Get(':id/members')
  @RequirePermissions('campaign.read')
  listMembers(@TenantId() tid: string, @Param('id') id: string, @Query('status') status?: string) {
    return this.svc.listMembers(tid, id, { status });
  }

  @Post(':id/members')
  @RequirePermissions('campaign.write')
  addMember(@TenantId() tid: string, @Param('id') id: string, @Body() body: AddMemberDto) {
    return this.svc.addMember(tid, id, {
      leadId: body.leadId,
      contactId: body.contactId,
      status: body.status as CampaignMemberStatus | undefined,
    });
  }

  @Put(':id/members/:memberId')
  @RequirePermissions('campaign.write')
  updateMember(
    @TenantId() tid: string, @Param('id') id: string, @Param('memberId') memberId: string,
    @Body() body: UpdateMemberStatusDto,
  ) {
    return this.svc.updateMemberStatus(tid, id, memberId, body.status as CampaignMemberStatus);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('campaign.write')
  removeMember(@TenantId() tid: string, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.svc.removeMember(tid, id, memberId);
  }
}
