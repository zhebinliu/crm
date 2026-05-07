// ─── AiChatService — Sales Copilot orchestrator ───────────────────────────
//
// Receives a conversation history + a new user message, runs the multi-turn
// tool-use loop with Claude, dispatches tool calls against the CRM, and
// returns the final assistant text + a transcript of intermediate tool
// calls (for transparency in the UI).
//
// Conversation state lives client-side (the panel persists it in
// localStorage). The server is stateless aside from the tool dispatch.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClient, type ChatTurn, type ChatBlock } from './claude.client';
import { COPILOT_TOOLS, COPILOT_TOOL_BY_NAME, type CopilotContext } from './copilot-tools';
import { AiService } from './ai.service';
import { EmbeddingService, type SimilarityHit } from '../embeddings/embedding.service';

// What the client sends in / receives back. Keep this stable — UI renders it.

export interface ChatMessage {
  role: 'user' | 'assistant';
  /** Plain text the user typed, OR plain text the assistant replied with. */
  text: string;
  /** Tool calls + results emitted by the assistant during this turn. */
  toolEvents?: Array<{
    name: string;
    input: unknown;
    /** Stringified result, possibly truncated for transport. */
    result: string;
    isError?: boolean;
    durationMs: number;
  }>;
}

export interface ChatResponse {
  assistant: ChatMessage;
  /** Full conversation history including the new turn — UI can drop its old copy. */
  history: ChatMessage[];
  meta: {
    modelName: string;
    source: 'live' | 'stub';
    totalLatencyMs: number;
    iterations: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

const COPILOT_SYSTEM_PROMPT = `你是「纷享销客」CRM 系统的 AI 销售助手 (Sales Copilot)，名字叫"小销"。

你帮助销售代表 (sales rep) 和销售经理 (sales manager) 完成以下事：
1. 查询管道、商机、客户、线索数据
2. 评估单个商机的赢单概率、识别风险
3. 准备客户拜访 briefing
4. 总结管道整体风险、找出停滞的 deal
5. 给出具体可执行的下一步建议

工作方式：
- 用户问什么你就**先用工具去查实际数据**，不要凭印象/想象编答案。
- 如果一个问题需要多步：先查数据，再分析，再给结论。
- 回答用**中文**，简洁、有结构。
- 涉及金额时用人民币（CNY），保留万为单位（如「12.5 万」）。
- 涉及具体商机/客户时，用 markdown 列表，每项包含名称 + 关键指标。
- 如果数据不足以回答，**直说**"我没有这方面数据"，不要编造。
- 涉及"我的"、"我"时，使用 mineOnly=true 参数过滤到当前用户。

回答风格：
- 不寒暄、不复读问题、直接给答案。
- 不超过 250 字。如果用户要详细，再展开。
- 用具体数据（"3 个商机，合计 86 万"）而不是模糊话术（"有一些商机"）。
- 给行动建议时用动词开头的祈使句。

可用工具列表已在 tools 字段提供。先调用相关工具，再回答。`;

const MAX_ITERATIONS = 6; // Hard cap to prevent runaway tool loops.

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly ai: AiService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Build the RAG-grounded system prompt: base copilot instructions + a
   * "Relevant records" block from semantic search. Conservative: if
   * retrieval yields nothing or errors, returns the unmodified base
   * prompt and we behave exactly like the pre-RAG path.
   */
  private async buildGroundedSystemPrompt(
    tenantId: string,
    userMessage: string,
  ): Promise<string> {
    let hits: SimilarityHit[] = [];
    try {
      hits = await this.embeddings.searchSimilar(tenantId, null, userMessage, 8);
    } catch (err) {
      this.logger.warn(`RAG retrieval failed; falling back to ungrounded prompt: ${(err as Error).message}`);
      return COPILOT_SYSTEM_PROMPT;
    }
    if (hits.length === 0) return COPILOT_SYSTEM_PROMPT;

    const lines = hits.map((h) => {
      // Truncate per-hit content to keep the prompt token-cheap.
      const snippet = h.content.length > 240 ? h.content.slice(0, 240) + '…' : h.content;
      return `- [${h.recordType}:${h.recordId}] ${snippet}`;
    });
    return `${COPILOT_SYSTEM_PROMPT}\n\n## Relevant records (retrieved from this tenant via semantic search)\n${lines.join('\n')}\n\n用上述相关记录辅助回答；如果上下文不足，再调用工具补充。`;
  }

  async chat(args: {
    tenantId: string;
    userId: string;
    permissions: string[];
    history: ChatMessage[];
    message: string;
  }): Promise<ChatResponse> {
    const t0 = Date.now();

    const ctx: CopilotContext = {
      tenantId: args.tenantId,
      userId: args.userId,
      permissions: args.permissions,
      prisma: this.prisma,
      ai: this.ai,
    };

    // Build claude-facing conversation: previous turns are flat text, plus the
    // brand-new user message. Intermediate tool_use/tool_result blocks from
    // *prior* turns are NOT replayed — the tools were synchronous and the
    // model's prior text already incorporated their results. This keeps the
    // history token-cheap while preserving conversational coherence.
    const turns: ChatTurn[] = [
      ...args.history.map((m): ChatTurn => ({
        role: m.role,
        content: m.text,
      })),
      { role: 'user', content: args.message },
    ];

    // RAG: retrieve top-K semantically-similar records for this tenant and
    // splice them into the system prompt. Falls back silently to the base
    // prompt if retrieval is empty or errors.
    const groundedSystemPrompt = await this.buildGroundedSystemPrompt(args.tenantId, args.message);

    const toolEvents: ChatMessage['toolEvents'] = [];
    let finalText = '';
    let iterations = 0;
    let modelName = '';
    let source: 'live' | 'stub' = 'live';
    const totalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

    while (iterations < MAX_ITERATIONS) {
      iterations += 1;
      const step = await this.claude.chatStep({
        system: groundedSystemPrompt,
        history: turns,
        tools: COPILOT_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        maxTokens: 1500,
      });

      modelName = step.modelName;
      source = step.source;
      totalUsage.inputTokens     += step.usage.inputTokens;
      totalUsage.outputTokens    += step.usage.outputTokens;
      totalUsage.cacheReadTokens += step.usage.cacheReadTokens;
      totalUsage.cacheWriteTokens += step.usage.cacheWriteTokens;

      // Append assistant turn (mixed text + tool_use blocks) to the conversation.
      turns.push({ role: 'assistant', content: step.blocks });

      if (step.toolUses.length === 0) {
        // Done — collect text and exit.
        finalText = step.text || '(未返回内容)';
        break;
      }

      // Execute each tool call and feed results back as a single user turn
      // containing tool_result blocks (per Anthropic API).
      const resultBlocks: ChatBlock[] = [];
      for (const call of step.toolUses) {
        const tool = COPILOT_TOOL_BY_NAME.get(call.name);
        const callT0 = Date.now();
        if (!tool) {
          const errMsg = `Unknown tool: ${call.name}`;
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: errMsg,
            is_error: true,
          });
          toolEvents.push({
            name: call.name,
            input: call.input,
            result: errMsg,
            isError: true,
            durationMs: Date.now() - callT0,
          });
          continue;
        }

        try {
          const result = await tool.handler((call.input as Record<string, unknown>) ?? {}, ctx);
          const serialized = JSON.stringify(result);
          // Truncate hard if a tool returns a huge blob — keep transcript readable.
          const trimmedForTranscript = serialized.length > 8_000
            ? serialized.slice(0, 8_000) + '…(已截断)'
            : serialized;
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: serialized,
          });
          toolEvents.push({
            name: call.name,
            input: call.input,
            result: trimmedForTranscript,
            durationMs: Date.now() - callT0,
          });
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          this.logger.warn(`tool ${call.name} failed: ${msg}`);
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: msg,
            is_error: true,
          });
          toolEvents.push({
            name: call.name,
            input: call.input,
            result: msg,
            isError: true,
            durationMs: Date.now() - callT0,
          });
        }
      }

      turns.push({ role: 'user', content: resultBlocks });
    }

    if (iterations >= MAX_ITERATIONS && !finalText) {
      finalText = '⚠️ 我反复调用工具但没能给出最终答复，请换一种问法或简化问题。';
    }

    const assistant: ChatMessage = {
      role: 'assistant',
      text: finalText,
      toolEvents: toolEvents.length > 0 ? toolEvents : undefined,
    };

    const history: ChatMessage[] = [
      ...args.history,
      { role: 'user', text: args.message },
      assistant,
    ];

    return {
      assistant,
      history,
      meta: {
        modelName,
        source,
        totalLatencyMs: Date.now() - t0,
        iterations,
        ...totalUsage,
      },
    };
  }

  // ── Streaming variant ────────────────────────────────────────────────────
  // Same orchestration as chat() but calls back into the supplied emit()
  // function as events occur. The HTTP layer wraps emit() into SSE writes.

  async chatStream(
    args: {
      tenantId: string;
      userId: string;
      permissions: string[];
      history: ChatMessage[];
      message: string;
    },
    emit: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const t0 = Date.now();
    const ctx: CopilotContext = {
      tenantId: args.tenantId,
      userId: args.userId,
      permissions: args.permissions,
      prisma: this.prisma,
      ai: this.ai,
    };

    const turns: ChatTurn[] = [
      ...args.history.map((m): ChatTurn => ({ role: m.role, content: m.text })),
      { role: 'user', content: args.message },
    ];
    const toolEvents: NonNullable<ChatMessage['toolEvents']> = [];

    // RAG-grounded system prompt for streaming variant.
    const groundedSystemPrompt = await this.buildGroundedSystemPrompt(args.tenantId, args.message);

    let finalText = '';
    let iterations = 0;
    let modelName = '';
    let source: 'live' | 'stub' = 'live';
    const totalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations += 1;

        const step = await this.claude.chatStepStream({
          system: groundedSystemPrompt,
          history: turns,
          tools: COPILOT_TOOLS.map((t) => ({
            name: t.name, description: t.description, input_schema: t.input_schema,
          })),
          maxTokens: 1500,
        }, (delta) => emit({ type: 'token', text: delta }));

        modelName = step.modelName;
        source = step.source;
        totalUsage.inputTokens += step.usage.inputTokens;
        totalUsage.outputTokens += step.usage.outputTokens;
        totalUsage.cacheReadTokens += step.usage.cacheReadTokens;
        totalUsage.cacheWriteTokens += step.usage.cacheWriteTokens;

        turns.push({ role: 'assistant', content: step.blocks });

        if (step.toolUses.length === 0) {
          finalText = step.text || '(未返回内容)';
          break;
        }

        // Inform the client text from this round is finished and tools are running.
        emit({ type: 'turn_break' });

        const resultBlocks: ChatBlock[] = [];
        for (const call of step.toolUses) {
          emit({ type: 'tool_call_start', name: call.name, input: call.input });
          const tool = COPILOT_TOOL_BY_NAME.get(call.name);
          const callT0 = Date.now();
          if (!tool) {
            const errMsg = `Unknown tool: ${call.name}`;
            resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: errMsg, is_error: true });
            toolEvents.push({ name: call.name, input: call.input, result: errMsg, isError: true, durationMs: Date.now() - callT0 });
            emit({ type: 'tool_call_end', name: call.name, durationMs: Date.now() - callT0, isError: true });
            continue;
          }
          try {
            const result = await tool.handler((call.input as Record<string, unknown>) ?? {}, ctx);
            const serialized = JSON.stringify(result);
            const trimmed = serialized.length > 8_000 ? serialized.slice(0, 8_000) + '…(已截断)' : serialized;
            resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: serialized });
            toolEvents.push({ name: call.name, input: call.input, result: trimmed, durationMs: Date.now() - callT0 });
            emit({ type: 'tool_call_end', name: call.name, durationMs: Date.now() - callT0 });
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            this.logger.warn(`tool ${call.name} failed: ${msg}`);
            resultBlocks.push({ type: 'tool_result', tool_use_id: call.id, content: msg, is_error: true });
            toolEvents.push({ name: call.name, input: call.input, result: msg, isError: true, durationMs: Date.now() - callT0 });
            emit({ type: 'tool_call_end', name: call.name, durationMs: Date.now() - callT0, isError: true });
          }
        }

        turns.push({ role: 'user', content: resultBlocks });
      }

      if (iterations >= MAX_ITERATIONS && !finalText) {
        finalText = '⚠️ 我反复调用工具但没能给出最终答复，请换一种问法或简化问题。';
        emit({ type: 'token', text: finalText });
      }

      const assistant: ChatMessage = {
        role: 'assistant',
        text: finalText,
        toolEvents: toolEvents.length > 0 ? toolEvents : undefined,
      };
      const history: ChatMessage[] = [
        ...args.history,
        { role: 'user', text: args.message },
        assistant,
      ];

      emit({
        type: 'done',
        assistant,
        history,
        meta: {
          modelName,
          source,
          totalLatencyMs: Date.now() - t0,
          iterations,
          ...totalUsage,
        },
      });
    } catch (err) {
      emit({ type: 'error', message: (err as Error).message ?? String(err) });
    }
  }
}

// ── Stream event union (server → client over SSE) ─────────────────────────

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'turn_break' }
  | { type: 'tool_call_start'; name: string; input: unknown }
  | { type: 'tool_call_end'; name: string; durationMs: number; isError?: boolean }
  | { type: 'done'; assistant: ChatMessage; history: ChatMessage[]; meta: ChatResponse['meta'] }
  | { type: 'error'; message: string };
