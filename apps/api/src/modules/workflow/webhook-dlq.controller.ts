// ─── WebhookDeadLetterController ─────────────────────────────────────────
// Admin-only inspect / replay / resolve for parked outbound webhooks.

import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@UseGuards(PermissionsGuard)
@Controller('admin/webhook-dlq')
export class WebhookDlqController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('admin.*')
  async list(
    @TenantId() tenantId: string,
    @Query('resolved') resolved?: string,
    @Query('take') take?: string,
  ) {
    const isResolved = resolved === 'true';
    const limit = Math.min(parseInt(take ?? '50', 10) || 50, 200);
    const rows = await this.prisma.webhookDeadLetter.findMany({
      where: {
        tenantId,
        ...(resolved !== undefined ? { resolvedAt: isResolved ? { not: null } : null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows;
  }

  @Post(':id/replay')
  @RequirePermissions('admin.*')
  async replay(@TenantId() tenantId: string, @Param('id') id: string) {
    const dlq = await this.prisma.webhookDeadLetter.findFirst({ where: { id, tenantId } });
    if (!dlq) throw new NotFoundException({ code: 'NOT_FOUND', message: 'DLQ entry not found' });
    if (dlq.resolvedAt) throw new BadRequestException({ code: 'CONFLICT', message: 'Already resolved' });

    try {
      const res = await fetch(dlq.url, {
        method: dlq.method,
        headers: { ...((dlq.headers as Record<string, string>) ?? {}) },
        body: dlq.body,
        signal: AbortSignal.timeout(10_000),
      });
      const ok = res.ok;
      const updated = await this.prisma.webhookDeadLetter.update({
        where: { id },
        data: {
          attempts: dlq.attempts + 1,
          lastStatus: res.status,
          lastError: ok ? null : `HTTP ${res.status}`,
          resolvedAt: ok ? new Date() : null,
          resolvedNote: ok ? 'replayed' : null,
        },
      });
      return { ok, status: res.status, entry: updated };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const updated = await this.prisma.webhookDeadLetter.update({
        where: { id },
        data: { attempts: dlq.attempts + 1, lastError: msg },
      });
      return { ok: false, error: msg, entry: updated };
    }
  }

  @Post(':id/resolve')
  @RequirePermissions('admin.*')
  async resolve(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    const dlq = await this.prisma.webhookDeadLetter.findFirst({ where: { id, tenantId } });
    if (!dlq) throw new NotFoundException({ code: 'NOT_FOUND', message: 'DLQ entry not found' });
    return this.prisma.webhookDeadLetter.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedNote: body?.note ?? 'manually resolved' },
    });
  }
}
