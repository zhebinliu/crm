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
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountService } from './account.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListAccountsQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}

export class CreateAccountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @RequirePermissions('account.read')
  list(@TenantId() tenantId: string, @Query() query: ListAccountsQuery) {
    return this.accountService.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('account.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.accountService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('account.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateAccountDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accountService.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('account.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateAccountDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accountService.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('account.delete')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.accountService.softDelete(tenantId, id);
  }
}
