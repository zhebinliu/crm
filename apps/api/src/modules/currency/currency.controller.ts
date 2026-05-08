// ── CurrencyController ───────────────────────────────────────────────────
// Admin REST surface for FX rates + the bulk recompute endpoint that
// refreshes `convertedAmount` across every Opp/Quote/Order after rate edits.
//
// Routes (all admin-only):
//   GET    /api/admin/currency-rates
//   POST   /api/admin/currency-rates
//   PATCH  /api/admin/currency-rates/:id
//   DELETE /api/admin/currency-rates/:id
//   GET    /api/admin/currency-rates/effective?from=USD&to=CNY&asOf=...
//   POST   /api/admin/currency-rates/recompute

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Length } from 'class-validator';
import { CurrencyService } from './currency.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class CreateRateDto {
  @IsString() @Length(3, 3) fromCurrency!: string;
  @IsString() @Length(3, 3) toCurrency!: string;
  @IsNumber() rate!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @IsIn(['manual', 'ecb', 'boc']) source?: string;
}

class UpdateRateDto {
  @IsOptional() @IsNumber() rate?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() @IsIn(['manual', 'ecb', 'boc']) source?: string;
}

@ApiTags('admin')
@UseGuards(PermissionsGuard)
@Controller('admin/currency-rates')
export class CurrencyController {
  constructor(private readonly svc: CurrencyService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(
    @TenantId() tid: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listRates(tid, { from, to });
  }

  @Get('effective')
  @RequirePermissions('admin.*')
  async effective(
    @TenantId() tid: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to are required');
    }
    const date = asOf ? new Date(asOf) : new Date();
    const rate = await this.svc.getRate(tid, from, to, date);
    return { from: from.toUpperCase(), to: to.toUpperCase(), asOf: date.toISOString(), rate };
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreateRateDto) {
    return this.svc.createRate(tid, dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdateRateDto) {
    return this.svc.updateRate(tid, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@TenantId() tid: string, @Param('id') id: string) {
    await this.svc.deleteRate(tid, id);
  }

  @Post('recompute')
  @RequirePermissions('admin.*')
  @HttpCode(HttpStatus.OK)
  async recompute(@TenantId() tid: string) {
    const counts = await this.svc.recomputeAll(tid);
    return {
      ok: true,
      counts,
      total: counts.opportunities + counts.quotes + counts.orders,
    };
  }
}
