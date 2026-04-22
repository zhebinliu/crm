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
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LeadService } from './lead.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListLeadsQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isConverted?: boolean;

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

export class CreateLeadDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class ConvertLeadDto {
  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  existingAccountId?: string;

  @IsOptional()
  contactInput?: Record<string, unknown>;

  @IsOptional()
  opportunityInput?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  doNotCreateOpp?: boolean;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @RequirePermissions('lead.read')
  list(@TenantId() tenantId: string, @Query() query: ListLeadsQuery) {
    return this.leadService.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('lead.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.leadService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('lead.write')
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateLeadDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leadService.create(tenantId, body as unknown as Record<string, unknown>, user);
  }

  @Put(':id')
  @RequirePermissions('lead.write')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateLeadDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leadService.update(tenantId, id, body as unknown as Record<string, unknown>, user);
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('lead.convert')
  convert(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: ConvertLeadDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leadService.convert(tenantId, id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('lead.delete')
  softDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.leadService.softDelete(tenantId, id);
  }
}
