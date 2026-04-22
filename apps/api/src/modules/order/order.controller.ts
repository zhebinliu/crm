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
import { OrderService } from './order.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListOrdersQuery {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateOrderDto {
  @IsString() accountId!: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsString() effectiveDate!: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @IsString() contractId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() poNumber?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsNumber() @Min(0) grandTotal?: number;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() effectiveDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() poNumber?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contractId?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Get()
  @RequirePermissions('order.read')
  list(@TenantId() tenantId: string, @Query() query: ListOrdersQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('order.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('order.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Post('from-quote/:quoteId')
  @RequirePermissions('order.write')
  createFromQuote(
    @TenantId() tenantId: string,
    @Param('quoteId') quoteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createFromQuote(tenantId, quoteId, user);
  }

  @Put(':id')
  @RequirePermissions('order.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('order.write')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('order.write')
  activate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.activate(tenantId, id, user);
  }
}
