// ─── REST endpoints for AI insights ────────────────────────────────────────
//
// All endpoints are tenant-scoped via the standard JWT guard. They each
// require `ai.read` for GET and `ai.invoke` for refresh.
//
//   GET  /ai/opportunities/:id/win-probability      → cached or fresh
//   POST /ai/opportunities/:id/win-probability/refresh
//   GET  /ai/opportunities/:id/activity-summary
//   POST /ai/opportunities/:id/activity-summary/refresh
//   GET  /ai/leads/:id/score
//   POST /ai/leads/:id/score/refresh

import {
  Body, Controller, Get, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AiService } from './ai.service';
import { AiChatService, type ChatMessage } from './ai-chat.service';
import { AiAnomalyService } from './ai-anomaly.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

class DraftLeadOutreachDto {
  @IsIn(['email', 'wechat', 'phone'])
  channel!: 'email' | 'wechat' | 'phone';

  @IsOptional()
  @IsIn(['professional', 'friendly', 'concise'])
  tone?: 'professional' | 'friendly' | 'concise';
}

class PipelineRiskQuery {
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8_000)
  text!: string;
}

class OppBandsByIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

class ChatRequestDto {
  @IsString()
  @MaxLength(2_000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}

@UseGuards(PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly chat: AiChatService,
    private readonly anomaly: AiAnomalyService,
  ) {}

  // ── Opportunity Win Probability ────────────────────────────────────────────

  @Get('opportunities/:id/win-probability')
  @RequirePermissions('ai.read')
  oppWinProb(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getOppWinProbability(tenantId, id, { userId: user.id });
  }

  @Post('opportunities/:id/win-probability/refresh')
  @RequirePermissions('ai.invoke')
  oppWinProbRefresh(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getOppWinProbability(tenantId, id, { force: true, userId: user.id });
  }

  // ── Opportunity Activity Summary ──────────────────────────────────────────

  @Get('opportunities/:id/activity-summary')
  @RequirePermissions('ai.read')
  oppActivitySummary(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getOppActivitySummary(tenantId, id, { userId: user.id });
  }

  @Post('opportunities/:id/activity-summary/refresh')
  @RequirePermissions('ai.invoke')
  oppActivitySummaryRefresh(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getOppActivitySummary(tenantId, id, { force: true, userId: user.id });
  }

  // ── Lead Score ────────────────────────────────────────────────────────────

  @Get('leads/:id/score')
  @RequirePermissions('ai.read')
  leadScore(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getLeadScore(tenantId, id, { userId: user.id });
  }

  @Post('leads/:id/score/refresh')
  @RequirePermissions('ai.invoke')
  leadScoreRefresh(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getLeadScore(tenantId, id, { force: true, userId: user.id });
  }

  // ── Account Briefing ──────────────────────────────────────────────────────

  @Get('accounts/:id/briefing')
  @RequirePermissions('ai.read')
  accountBriefing(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getAccountBriefing(tenantId, id, { userId: user.id });
  }

  @Post('accounts/:id/briefing/refresh')
  @RequirePermissions('ai.invoke')
  accountBriefingRefresh(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.getAccountBriefing(tenantId, id, { force: true, userId: user.id });
  }

  // ── Bulk band lookup ─────────────────────────────────────────────────────

  @Post('opportunities/bands')
  @RequirePermissions('ai.read')
  oppBandsByIds(
    @TenantId() tenantId: string,
    @Body() body: OppBandsByIdsDto,
  ) {
    return this.ai.getOpportunityBandsByIds(tenantId, body.ids.slice(0, 500));
  }

  // ── Pipeline Risk Board ──────────────────────────────────────────────────

  @Get('pipeline-risk')
  @RequirePermissions('ai.read')
  pipelineRisk(
    @TenantId() tenantId: string,
    @Query() q: PipelineRiskQuery,
  ) {
    return this.ai.getPipelineRisk(tenantId, {
      ownerId: q.ownerId,
      stage: q.stage,
      limit: q.limit,
    });
  }

  // ── Lead Outreach Drafting ────────────────────────────────────────────────

  @Post('leads/:id/draft-outreach')
  @RequirePermissions('ai.invoke')
  draftLeadOutreach(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: DraftLeadOutreachDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ai.draftLeadOutreach(
      tenantId,
      id,
      { channel: body.channel, tone: body.tone ?? 'professional' },
      user.id,
    );
  }

  // ── Dashboard AI summary ─────────────────────────────────────────────────

  @Get('dashboard-summary')
  @RequirePermissions('ai.read')
  dashboardSummary(
    @TenantId() tenantId: string,
    @Query('mineOnly') mineOnly: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const ownerId = mineOnly === 'true' ? user.id : undefined;
    return this.anomaly.getDashboardSummary(tenantId, ownerId);
  }

  // ── Admin: trigger anomaly scan now (manual run) ─────────────────────────

  @Post('admin/anomaly-scan')
  @RequirePermissions('admin.*')
  async triggerAnomalyScan() {
    return this.anomaly.scanAll();
  }

  // ── Admin: AI usage telemetry (this tenant only) ─────────────────────────

  @Get('admin/telemetry')
  @RequirePermissions('admin.*')
  telemetry(
    @TenantId() tenantId: string,
    @Query('days') days: string | undefined,
  ) {
    return this.ai.getTelemetry(tenantId, {
      days: days ? Number(days) : undefined,
    });
  }

  // ── Sales Copilot Chat ────────────────────────────────────────────────────

  @Post('chat')
  @RequirePermissions('ai.invoke')
  copilotChat(
    @TenantId() tenantId: string,
    @Body() body: ChatRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    const history: ChatMessage[] = (body.history ?? []).map((m) => ({
      role: m.role,
      text: m.text,
    }));
    return this.chat.chat({
      tenantId,
      userId: user.id,
      permissions: user.permissions ?? [],
      history,
      message: body.message,
    });
  }

  // ── Streaming variant of /ai/chat ────────────────────────────────────────
  // Uses SSE-style chunks over a regular POST so the existing JWT
  // Authorization header still works (EventSource doesn't allow auth headers).
  // Each chunk is `data: {json}\n\n`.

  @Post('chat/stream')
  @RequirePermissions('ai.invoke')
  async copilotChatStream(
    @TenantId() tenantId: string,
    @Body() body: ChatRequestDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders?.();

    const history: ChatMessage[] = (body.history ?? []).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const write = (eventName: string, payload: unknown) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await this.chat.chatStream(
        {
          tenantId,
          userId: user.id,
          permissions: user.permissions ?? [],
          history,
          message: body.message,
        },
        (event) => {
          write(event.type, event);
        },
      );
    } catch (err) {
      write('error', { message: (err as Error).message ?? String(err) });
    }
    res.end();
  }
}
