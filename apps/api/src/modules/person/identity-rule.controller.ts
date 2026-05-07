// ─── IdentityRuleController ──────────────────────────────────────────────
// Admin CRUD for IdentityRule rows. The IdentityResolutionService consults
// these on every Lead/Contact write.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

const COMPARATORS = [
  'exact_email',
  'exact_phone',
  'exact_name_email_domain',
  'fuzzy_name',
  'first_letter_lastname_email',
] as const;

class CreateIdentityRuleDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(COMPARATORS) comparator!: typeof COMPARATORS[number];
  @IsOptional() @IsBoolean() surfaceOnly?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) priority?: number;
}

class UpdateIdentityRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(COMPARATORS) comparator?: typeof COMPARATORS[number];
  @IsOptional() @IsBoolean() surfaceOnly?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) priority?: number;
}

@UseGuards(PermissionsGuard)
@Controller('admin/identity-rules')
export class IdentityRuleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tenantId: string) {
    return this.prisma.identityRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Post()
  @RequirePermissions('admin.*')
  create(@TenantId() tenantId: string, @Body() body: CreateIdentityRuleDto) {
    return this.prisma.identityRule.create({ data: { tenantId, ...body } });
  }

  @Patch(':id')
  @RequirePermissions('admin.*')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateIdentityRuleDto,
  ) {
    await this.prisma.identityRule.updateMany({ where: { id, tenantId }, data: body });
    return this.prisma.identityRule.findFirst({ where: { id, tenantId } });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.prisma.identityRule.deleteMany({ where: { id, tenantId } });
  }
}
