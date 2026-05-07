import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationService } from './notification.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class ListNotifQuery {
  @IsOptional() @IsBooleanString() unreadOnly?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;
}

@UseGuards(PermissionsGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Query() q: ListNotifQuery,
  ) {
    return this.svc.list(tenantId, user.id, {
      unreadOnly: q.unreadOnly === 'true',
      take: q.take,
    });
  }

  @Post(':id/read')
  markRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.svc.markRead(tenantId, user.id, id);
  }

  @Post('mark-all-read')
  markAllRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.svc.markAllRead(tenantId, user.id);
  }
}
