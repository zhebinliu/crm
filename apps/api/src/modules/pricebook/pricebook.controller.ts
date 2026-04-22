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
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PriceBookService } from './pricebook.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListPriceBooksQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreatePriceBookDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() isStandard?: boolean;
}

export class UpdatePriceBookDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
}

export class AddPriceBookEntryDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsString() currencyCode?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('price-books')
export class PriceBookController {
  constructor(private readonly service: PriceBookService) {}

  @Get()
  @RequirePermissions('pricebook.read')
  list(@TenantId() tenantId: string, @Query() query: ListPriceBooksQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('pricebook.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('pricebook.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreatePriceBookDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createBook(tenantId, body.name, body.isStandard ?? false, user);
  }

  @Put(':id')
  @RequirePermissions('pricebook.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdatePriceBookDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('pricebook.write')
  remove(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.setActive(tenantId, id, false, user);
  }

  @Post(':id/entries')
  @RequirePermissions('pricebook.write')
  addEntry(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: AddPriceBookEntryDto,
  ) {
    return this.service.addEntry(tenantId, id, body.productId, body.unitPrice, body.currencyCode);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('pricebook.write')
  removeEntry(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    return this.service.removeEntry(tenantId, id, entryId);
  }
}
