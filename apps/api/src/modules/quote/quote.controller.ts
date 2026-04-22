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
import { QuoteService } from './quote.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListQuotesQuery {
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateQuoteDto {
  @IsString() name!: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) shippingAmount?: number;
}

export class UpdateQuoteDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) shippingAmount?: number;
  @IsOptional() @IsString() ownerId?: string;
}

export class AddQuoteLineItemDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discount?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsString() description?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('quotes')
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Get()
  @RequirePermissions('quote.read')
  list(@TenantId() tenantId: string, @Query() query: ListQuotesQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('quote.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('quote.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateQuoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Post('from-opportunity/:oppId')
  @RequirePermissions('quote.write')
  createFromOpportunity(
    @TenantId() tenantId: string,
    @Param('oppId') oppId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createFromOpportunity(tenantId, oppId, user);
  }

  @Put(':id')
  @RequirePermissions('quote.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateQuoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('quote.write')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }

  @Post(':id/line-items')
  @RequirePermissions('quote.write')
  addLineItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: AddQuoteLineItemDto,
  ) {
    return this.service.addLineItem(tenantId, id, body);
  }

  @Delete(':id/line-items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('quote.write')
  removeLineItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeLineItem(tenantId, id, itemId);
  }
}
