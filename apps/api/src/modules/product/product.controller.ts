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
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ProductService } from './product.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListProductsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() family?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 20;
}

export class CreateProductDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() family?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() taxable?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() family?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() taxable?: boolean;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get()
  @RequirePermissions('product.read')
  list(@TenantId() tenantId: string, @Query() query: ListProductsQuery) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('product.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('product.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('product.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.softDelete(tenantId, id);
  }
}
