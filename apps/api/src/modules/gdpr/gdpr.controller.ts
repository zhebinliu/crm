// ─── GdprController ──────────────────────────────────────────────────────
// HTTP surface for GDPR data-subject rights.
//   POST   /api/persons/:id/export         → GdprExportBundle (JSON)
//   DELETE /api/persons/:id?reason=...     → erase with confirm:true
//
// All endpoints require admin.* — these operations cross every CRM table
// and must not be available to standard users.

import {
  BadRequestException, Body, Controller, Delete, HttpCode, HttpStatus,
  Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString } from 'class-validator';
import { GdprService } from './gdpr.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class EraseDto {
  @IsBoolean() confirm!: boolean;
  @IsString() reason!: string;
}

@UseGuards(PermissionsGuard)
@Controller('persons')
export class GdprController {
  constructor(private readonly svc: GdprService) {}

  @Post(':id/export')
  @RequirePermissions('admin.*')
  @HttpCode(HttpStatus.OK)
  async export(
    @TenantId() tid: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.exportData(tid, id, user.id);
  }

  @Delete(':id')
  @RequirePermissions('admin.*')
  @HttpCode(HttpStatus.OK)
  async erase(
    @TenantId() tid: string,
    @Param('id') id: string,
    @Query('reason') queryReason: string | undefined,
    @Body() body: EraseDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (body?.confirm !== true) {
      throw new BadRequestException('GDPR erasure requires confirm=true in body');
    }
    const reason = (body.reason ?? queryReason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('GDPR erasure requires a non-empty reason');
    }
    return this.svc.eraseData(tid, id, user.id, reason);
  }
}
