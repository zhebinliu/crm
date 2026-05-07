import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ImportService } from './import.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class ImportCsvDto {
  // ~5MB cap (UTF-8). Larger imports should use a job queue (out of scope).
  @IsString() @MaxLength(5 * 1024 * 1024)
  csv!: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/import')
export class ImportController {
  constructor(private readonly svc: ImportService) {}

  // CSV import is the heaviest endpoint we expose: one request can fan
  // out to thousands of writes. 10 req/min per (tenant, ip) is plenty.
  @Post(':objectApiName')
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 10, ttl: 60_000 },
  })
  @RequirePermissions('admin.*')
  async importCsv(
    @TenantId() tenantId: string,
    @Param('objectApiName') objectApiName: string,
    @Body() body: ImportCsvDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.importCsv(tenantId, objectApiName, body.csv, user);
  }
}
