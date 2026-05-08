import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject,
  IsOptional, IsString, Max, Min,
} from 'class-validator';
import { SlaService } from './sla.service';
import { EntitlementService } from './entitlement.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class CreatePolicyDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() caseFilter?: Record<string, unknown>;
  @IsOptional() @IsObject() businessHours?: Record<string, unknown>;
  @IsOptional() @IsArray() holidays?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(60 * 24 * 30) firstResponseTargetMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60 * 24 * 365) resolutionTargetMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) priority?: number;
}

class UpdatePolicyDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() caseFilter?: Record<string, unknown>;
  @IsOptional() @IsObject() businessHours?: Record<string, unknown>;
  @IsOptional() @IsArray() holidays?: string[];
  @IsOptional() @IsInt() @Min(1) firstResponseTargetMinutes?: number;
  @IsOptional() @IsInt() @Min(1) resolutionTargetMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) priority?: number;
}

class CreateEntitlementDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsString() slaPolicyId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsIn(['active', 'expired', 'cancelled']) status?: string;
  @IsOptional() @IsString() tier?: string;
}

class UpdateEntitlementDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() slaPolicyId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsIn(['active', 'expired', 'cancelled']) status?: string;
  @IsOptional() @IsString() tier?: string;
}

class ListEntitlementsQuery {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() status?: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/sla-policies')
export class SlaPolicyController {
  constructor(private readonly svc: SlaService) {}

  @Get()
  @RequirePermissions('admin.read')
  list(@TenantId() tid: string) {
    return this.svc.listPolicies(tid);
  }

  @Get(':id')
  @RequirePermissions('admin.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.getPolicy(tid, id);
  }

  @Post()
  @RequirePermissions('admin.write')
  create(@TenantId() tid: string, @Body() body: CreatePolicyDto) {
    return this.svc.createPolicy(tid, body as unknown as Record<string, unknown>);
  }

  @Patch(':id')
  @RequirePermissions('admin.write')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() body: UpdatePolicyDto) {
    return this.svc.updatePolicy(tid, id, body as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.write')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.deletePolicy(tid, id);
  }
}

@UseGuards(PermissionsGuard)
@Controller('admin/entitlements')
export class EntitlementController {
  constructor(private readonly svc: EntitlementService) {}

  @Get()
  @RequirePermissions('admin.read')
  list(@TenantId() tid: string, @Query() q: ListEntitlementsQuery) {
    return this.svc.list(tid, q);
  }

  @Get(':id')
  @RequirePermissions('admin.read')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.get(tid, id);
  }

  @Post()
  @RequirePermissions('admin.write')
  create(@TenantId() tid: string, @Body() body: CreateEntitlementDto) {
    return this.svc.create(tid, body as unknown as Record<string, unknown>);
  }

  @Patch(':id')
  @RequirePermissions('admin.write')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() body: UpdateEntitlementDto) {
    return this.svc.update(tid, id, body as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.write')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }
}

@UseGuards(PermissionsGuard)
@Controller('cases')
export class CaseSlaController {
  constructor(private readonly svc: SlaService) {}

  @Get(':id/milestones')
  @RequirePermissions('case.read')
  list(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.listMilestones(tid, id);
  }

  @Post(':id/first-response')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('case.write')
  async markFirstResponse(@TenantId() tid: string, @Param('id') id: string) {
    await this.svc.markFirstResponse(tid, id);
    return { ok: true };
  }
}
