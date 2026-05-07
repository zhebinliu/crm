import {
  Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RecycleBinService } from './recycle-bin.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

const RECORD_TYPES = [
  'lead', 'account', 'contact', 'opportunity',
  'quote', 'order', 'contract', 'activity', 'case',
];

class ListRecycleBinQuery {
  @IsOptional() @IsIn(RECORD_TYPES) recordType?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number = 50;
}

@UseGuards(PermissionsGuard)
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly svc: RecycleBinService) {}

  @Get()
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string, @Query() q: ListRecycleBinQuery) {
    return this.svc.list(tid, q);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin.*')
  restore(
    @TenantId() tid: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.restore(tid, id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  purge(
    @TenantId() tid: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.purge(tid, id, user.id);
  }
}
