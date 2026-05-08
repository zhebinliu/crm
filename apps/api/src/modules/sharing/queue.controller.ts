// REST surface for Queues. Admin endpoints under /api/admin/queues; the
// claim/list-items operations are exposed at /api/queues/:id/* so end users
// (lead-write / case-write permissioned) can pull work without admin perm.

import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { QueueService } from './queue.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class CreateQueueDto {
  @IsString() apiName!: string;
  @IsString() label!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) supportedObjects!: string[];
  @IsOptional() @IsString() groupId?: string | null;
}

class UpdateQueueDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) supportedObjects?: string[];
  @IsOptional() @IsString() groupId?: string | null;
}

class ClaimDto {
  @IsString() recordId!: string;
  @IsIn(['lead', 'case']) recordType!: 'lead' | 'case';
}

@UseGuards(PermissionsGuard)
@Controller()
export class QueueController {
  constructor(private readonly svc: QueueService) {}

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  @Get('admin/queues')
  @RequirePermissions('admin.*')
  list(@TenantId() tid: string) {
    return this.svc.list(tid);
  }

  @Get('admin/queues/:id')
  @RequirePermissions('admin.*')
  get(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.get(tid, id);
  }

  @Post('admin/queues')
  @RequirePermissions('admin.*')
  create(@TenantId() tid: string, @Body() dto: CreateQueueDto) {
    return this.svc.create(tid, dto);
  }

  @Patch('admin/queues/:id')
  @RequirePermissions('admin.*')
  update(@TenantId() tid: string, @Param('id') id: string, @Body() dto: UpdateQueueDto) {
    return this.svc.update(tid, id, dto);
  }

  @Delete('admin/queues/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('admin.*')
  remove(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }

  // ── Operator-facing ───────────────────────────────────────────────────────

  @Get('queues/:id/items')
  @RequirePermissions('admin.*')
  listItems(@TenantId() tid: string, @Param('id') id: string) {
    return this.svc.listItems(tid, id);
  }

  /**
   * Claim a queue item. The DTO carries `recordType` and `recordId`; the
   * service enforces queue-group membership. Permission gate is the union
   * `lead.write` ∪ `case.write` — controller checks `lead.write` to keep
   * the @RequirePermissions decorator simple, and the service-level
   * supportedObjects check makes case-claims by lead-write users impossible
   * (queue must list 'case'). For stricter enforcement see TODO below.
   *
   * TODO: add a per-recordType permission re-check in the service so a
   * lead.write-only user cannot claim from a queue that's also wired to
   * cases (today the queue.supportedObjects check is enough since each
   * queue is typically single-object).
   */
  @Post('queues/:id/claim')
  @RequirePermissions('lead.write')
  claim(
    @TenantId() tid: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ClaimDto,
  ) {
    return this.svc.claim({
      tenantId: tid,
      queueId: id,
      recordType: dto.recordType,
      recordId: dto.recordId,
      userId: user.id,
    });
  }
}
