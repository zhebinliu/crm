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
  Body, Controller, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AiService } from './ai.service';
import { AiChatService, type ChatMessage } from './ai-chat.service';
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
      history,
      message: body.message,
    });
  }
}
