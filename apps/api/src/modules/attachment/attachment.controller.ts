// ─── AttachmentController ───────────────────────────────────────────────
// REST surface for the presigned-URL flow.
//
// JSON endpoints (auth + permission-guarded):
//   POST   /api/attachments/presign-upload
//   POST   /api/attachments/:id/confirm
//   GET    /api/attachments/:id/presign-download
//   DELETE /api/attachments/:id
//
// Local-backend-only raw endpoints (HMAC-signed URLs, no JWT):
//   PUT  /api/attachments/:id/local-upload   — accepts raw bytes
//   GET  /api/attachments/:id/download       — streams from disk

import {
  BadRequestException, Body, Controller, Delete, ForbiddenException,
  Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request, Response } from 'express';
import { AttachmentStorageService } from './storage.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class PresignUploadDto {
  @IsString() filename!: string;
  @IsString() contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(50 * 1024 * 1024) sizeBytes!: number;
  @IsOptional() @IsString() recordType?: string;
  @IsOptional() @IsString() recordId?: string;
}

class ConfirmUploadDto {
  @IsOptional() @IsString() checksum?: string;
}

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly storage: AttachmentStorageService) {}

  // ─── JSON endpoints (auth-guarded) ────────────────────────────────────

  @Post('presign-upload')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('attachment.write')
  presignUpload(
    @TenantId() tid: string,
    @CurrentUser() user: RequestUser,
    @Body() body: PresignUploadDto,
  ) {
    return this.storage.presignUpload(tid, user.id, body);
  }

  @Post(':id/confirm')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('attachment.write')
  confirm(
    @TenantId() tid: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: ConfirmUploadDto,
  ) {
    return this.storage.confirmUpload(tid, id, user.id, body.checksum);
  }

  @Get(':id/presign-download')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('attachment.read')
  presignDownload(@TenantId() tid: string, @Param('id') id: string) {
    return this.storage.presignDownload(tid, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('attachment.delete')
  remove(
    @TenantId() tid: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.storage.softDelete(tid, id, user.id);
  }

  // ─── Local-backend raw endpoints ──────────────────────────────────────
  // These are unguarded by JWT — they rely on the HMAC-signed presigned URL.
  // The signature binds to the attachmentId + operation + expiry.

  @Put(':id/local-upload')
  @HttpCode(HttpStatus.OK)
  async localUpload(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
  ) {
    if (!this.storage.isLocal()) throw new BadRequestException('local-upload disabled');
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || !sig) throw new BadRequestException('missing signature');
    if (!this.storage.verifyLocalSignature(id, 'put', expNum, sig)) {
      throw new ForbiddenException('invalid or expired upload signature');
    }
    const row = await this.storage.getRowUnscoped(id);
    if (!row.storageKey) throw new BadRequestException('attachment has no storage key');

    // Collect raw body. Express's default JSON parser is bypassed for this
    // route since main.ts/app uses raw body or middleware will skip it.
    // We read directly from the request stream.
    await this.storage.writeLocalBytes(row.storageKey, req);
    return { ok: true, id };
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!this.storage.isLocal()) throw new BadRequestException('local download disabled');
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || !sig) throw new BadRequestException('missing signature');
    if (!this.storage.verifyLocalSignature(id, 'get', expNum, sig)) {
      throw new ForbiddenException('invalid or expired download signature');
    }
    const row = await this.storage.getRowUnscoped(id);
    if (!row.storageKey) throw new BadRequestException('attachment has no bytes');
    if (row.virusScanStatus === 'infected') throw new ForbiddenException('blocked');

    const stream = await this.storage.readLocalStream(row.storageKey);
    res.setHeader('Content-Type', row.contentType ?? 'application/octet-stream');
    if (row.filename) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.filename)}"`);
    }
    stream.pipe(res);
  }
}
