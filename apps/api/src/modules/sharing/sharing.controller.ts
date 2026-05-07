// REST surface for record-share management. Two operations:
//   POST   /shares       — grant: { recordType, recordId, granteeUserId, accessLevel?, reason? }
//   DELETE /shares/:id   — revoke (or use the unique key directly)
//   GET    /shares/:recordType/:recordId — list shares on a record

import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { SharingService } from './sharing.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class ShareRecordDto {
  @IsString() recordType!: string;
  @IsString() recordId!: string;
  @IsString() granteeUserId!: string;
  @IsOptional() @IsIn(['READ', 'EDIT']) accessLevel?: 'READ' | 'EDIT';
  @IsOptional() @IsString() reason?: string;
}

@UseGuards(PermissionsGuard)
@Controller('shares')
export class SharingController {
  constructor(private readonly svc: SharingService) {}

  @Get(':recordType/:recordId')
  list(
    @TenantId() tenantId: string,
    @Param('recordType') recordType: string,
    @Param('recordId') recordId: string,
  ) {
    return this.svc.listSharesForRecord(tenantId, recordType, recordId);
  }

  @Post()
  share(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: ShareRecordDto,
  ) {
    return this.svc.shareRecord({
      tenantId,
      actorId: user.id,
      recordType: body.recordType,
      recordId: body.recordId,
      granteeUserId: body.granteeUserId,
      accessLevel: body.accessLevel,
      reason: body.reason,
    });
  }

  @Delete(':recordType/:recordId/:granteeUserId')
  revoke(
    @TenantId() tenantId: string,
    @Param('recordType') recordType: string,
    @Param('recordId') recordId: string,
    @Param('granteeUserId') granteeUserId: string,
  ) {
    return this.svc.revokeShare(tenantId, recordType, recordId, granteeUserId);
  }
}
