import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { BulkService, type BulkOp } from './bulk.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class BulkBodyDto {
  @IsIn(['insert', 'update', 'upsert', 'delete'])
  op!: BulkOp;

  @IsArray()
  records!: Array<Record<string, unknown>>;

  @IsOptional() @IsString()
  externalIdField?: string;
}

@UseGuards(PermissionsGuard)
@Controller('bulk')
export class BulkController {
  constructor(private readonly svc: BulkService) {}

  /**
   * POST /v1/bulk/:objectApiName
   * Body: { op: insert|update|upsert|delete, records: [...] }
   * Returns per-row success/error with original index for resumable processing.
   *
   * Permission: requires <object>.write for insert/update/upsert,
   * <object>.delete for delete. We use <object>.write as the floor here;
   * the per-record service.create/update/delete may further restrict.
   */
  // Bulk ops are heavy: hold them to 10/min per (tenant, ip) and disable
  // the per-second short-tier (a single bulk request is one HTTP call).
  @Post(':objectApiName')
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 10, ttl: 60_000 },
  })
  @RequirePermissions('lead.write') // floor; per-row service still enforces specifics
  bulk(
    @TenantId() tenantId: string,
    @Param('objectApiName') objectApiName: string,
    @Body() body: BulkBodyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.runBulk(tenantId, objectApiName, body, user);
  }
}
