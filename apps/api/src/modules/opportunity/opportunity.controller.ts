import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpportunityService } from './opportunity.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListOpportunitiesQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() forecastCategory?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateOpportunityDto {
  @IsString() name!: string;
  @IsString() accountId!: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsString() closeDate!: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() leadSource?: string;
  @IsOptional() @IsString() nextStep?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() primaryContactId?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() leadSource?: string;
  @IsOptional() @IsString() nextStep?: string;
  @IsOptional() @IsString() description?: string;
}

export class AddLineItemDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discount?: number;
  @IsOptional() @IsString() description?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}

  @Get()
  @RequirePermissions('opportunity.read')
  list(@TenantId() tenantId: string, @Query() query: ListOpportunitiesQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('opportunity.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('opportunity.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateOpportunityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('opportunity.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateOpportunityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('opportunity.delete')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }

  @Post(':id/line-items')
  @RequirePermissions('opportunity.write')
  addLineItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: AddLineItemDto,
  ) {
    return this.service.addLineItem(tenantId, id, body);
  }

  @Delete(':id/line-items/:lineItemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('opportunity.write')
  removeLineItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
  ) {
    return this.service.removeLineItem(tenantId, id, lineItemId);
  }
}
