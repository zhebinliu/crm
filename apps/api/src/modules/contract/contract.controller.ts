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
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ContractService } from './contract.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListContractsQuery {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateContractDto {
  @IsString() name!: string;
  @IsString() accountId!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsInt() @Min(1) term?: number;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() billingFrequency?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() signedAt?: string;
  @IsOptional() @IsString() signedBy?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) term?: number;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() billingFrequency?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() signedAt?: string;
  @IsOptional() @IsString() signedBy?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Get()
  @RequirePermissions('contract.read')
  list(@TenantId() tenantId: string, @Query() query: ListContractsQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('contract.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('contract.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateContractDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('contract.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateContractDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('contract.write')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('contract.write')
  activate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.activate(tenantId, id, user);
  }

  @Post(':id/terminate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('contract.write')
  terminate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.terminate(tenantId, id, user);
  }
}
