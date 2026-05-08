// ── TranslationController ────────────────────────────────────────────────
// Admin REST surface for per-tenant locale label overrides.
//
//   GET    /api/admin/translations?entityType=&locale=
//   PUT    /api/admin/translations/:entityType/:entityId/:locale
//   DELETE /api/admin/translations/:entityType/:entityId/:locale

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { TranslationService, EntityType } from './translation.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

const ENTITY_TYPES: EntityType[] = ['object', 'field', 'picklist', 'picklist_value'];

class UpsertTranslationDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() helpText?: string;
}

@ApiTags('admin')
@UseGuards(PermissionsGuard)
@Controller('admin/translations')
export class TranslationController {
  constructor(private readonly svc: TranslationService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(
    @TenantId() tid: string,
    @Query('entityType') entityType?: string,
    @Query('locale') locale?: string,
  ) {
    if (entityType && !ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new BadRequestException(`entityType must be one of ${ENTITY_TYPES.join(', ')}`);
    }
    return this.svc.list(tid, { entityType: entityType as EntityType | undefined, locale });
  }

  @Put(':entityType/:entityId/:locale')
  @RequirePermissions('admin.*')
  upsert(
    @TenantId() tid: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertTranslationDto,
  ) {
    if (!ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new BadRequestException(`entityType must be one of ${ENTITY_TYPES.join(', ')}`);
    }
    return this.svc.upsert(tid, entityType as EntityType, entityId, locale, dto);
  }

  @Delete(':entityType/:entityId/:locale')
  @RequirePermissions('admin.*')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantId() tid: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('locale') locale: string,
  ) {
    if (!ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new BadRequestException(`entityType must be one of ${ENTITY_TYPES.join(', ')}`);
    }
    await this.svc.remove(tid, entityType as EntityType, entityId, locale);
  }
}
