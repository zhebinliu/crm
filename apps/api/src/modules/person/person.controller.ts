// ─── PersonController ────────────────────────────────────────────────────
// REST surface for the Customer 360 unified Person.

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PersonService } from './person.service';
import { TenantId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class ListPersonQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number = 50;
}

class MergeDto {
  @IsString() winnerId!: string;
  @IsString() loserId!: string;
}

class ResolveCandidateDto {
  @IsIn(['confirm_merge', 'reject']) decision!: 'confirm_merge' | 'reject';
  @IsOptional() @IsString() note?: string;
}

@UseGuards(PermissionsGuard)
@Controller('persons')
export class PersonController {
  constructor(private readonly svc: PersonService) {}

  @Get()
  @RequirePermissions('lead.read', 'contact.read')
  list(@TenantId() tenantId: string, @Query() query: ListPersonQuery) {
    return this.svc.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('lead.read', 'contact.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.getWithRelations(tenantId, id);
  }

  /**
   * GET /persons/:id/timeline — unified Customer 360 feed
   * Returns merged chronological list of touchpoints across all clouds.
   */
  @Get(':id/timeline')
  @RequirePermissions('lead.read', 'contact.read')
  timeline(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query('take') take?: string,
  ) {
    return this.svc.timeline(tenantId, id, { take: take ? parseInt(take, 10) : undefined });
  }

  @Post('merge')
  @RequirePermissions('admin.*')
  merge(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: MergeDto,
  ) {
    return this.svc.merge(tenantId, body.winnerId, body.loserId, user.id);
  }

  @Get('dedupe/candidates')
  @RequirePermissions('lead.read', 'contact.read')
  listDedupeCandidates(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.listDedupeCandidates(tenantId, {
      status,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Post('dedupe/candidates/:id/resolve')
  @RequirePermissions('lead.write', 'contact.write')
  resolveCandidate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: ResolveCandidateDto,
  ) {
    return this.svc.resolveCandidate(tenantId, id, body.decision, user.id, body.note);
  }
}
