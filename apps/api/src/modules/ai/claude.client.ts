// ─── Anthropic Claude client wrapper ──────────────────────────────────────────
//
// Thin layer over @anthropic-ai/sdk that:
//   • Loads config from env (ANTHROPIC_API_KEY, AI_MODEL, AI_MAX_TOKENS, etc.)
//   • Supports prompt caching (cache_control on system prompts) so repeated
//     callers paying the same system context don't re-bill it.
//   • Returns a normalized { json, text, usage, latencyMs, modelName } envelope.
//   • Falls back to a HeuristicStub when no API key is configured. This keeps
//     dev/CI environments functional without a real key — the UI gets a
//     plausible result generated from the input itself.
//
// IMPORTANT: this module never throws on missing API key. Callers can assume
// `complete()` always resolves; check `result.source === 'stub'` if you need
// to know whether real AI ran.

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeCompleteOpts {
  /** System prompt — rules / persona / output schema. Cached if length warrants. */
  system: string;
  /** User message — per-request payload. Not cached. */
  user: string;
  /** Optional assistant prefill, e.g. `{` to force JSON output. */
  prefill?: string;
  /** Cap on output tokens. Default 1024. */
  maxTokens?: number;
  /** Override model name for this call. */
  model?: string;
  /** If true, request prompt caching on system prompt. Default true if system is ≥1024 chars. */
  cacheSystem?: boolean;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ClaudeResult<TJson = unknown> {
  /** Raw text from the model. */
  text: string;
  /** Parsed JSON if text was a JSON object (or prefilled with `{`). null otherwise. */
  json: TJson | null;
  usage: ClaudeUsage;
  latencyMs: number;
  modelName: string;
  /** "live" if hit Anthropic; "stub" if no API key configured. */
  source: 'live' | 'stub';
}

// ── Tool-use API ───────────────────────────────────────────────────────────
//
// Used by AiChatService to power the Sales Copilot. The wrapper exposes the
// raw multi-turn loop: caller sends `messages`, gets back content blocks
// (text + tool_use), runs the tools, calls again with tool_result blocks,
// etc. We also surface usage and source so the UI can show tokens/latency.

export interface ChatTurn {
  role: 'user' | 'assistant';
  /** String for plain text turns; array for tool-use / tool-result turns. */
  content: string | ChatBlock[];
}

export type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export interface ChatStepResult {
  /** Final assistant content blocks for this step. */
  blocks: ChatBlock[];
  /** Concatenated text across `text` blocks (convenience). */
  text: string;
  /** Tool-use blocks that callers must dispatch and feed back in. */
  toolUses: Array<{ id: string; name: string; input: unknown }>;
  stopReason: string | null;
  usage: ClaudeUsage;
  latencyMs: number;
  modelName: string;
  source: 'live' | 'stub';
}

const DEFAULT_MODEL = process.env.AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? '1024');
const CACHE_THRESHOLD_CHARS = 1024;

@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private readonly client: Anthropic | null;
  private readonly defaultModel = DEFAULT_MODEL;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log(`Anthropic client initialized (model=${this.defaultModel})`);
    } else {
      this.client = null;
      this.logger.warn('ANTHROPIC_API_KEY not set — AI calls will use heuristic stub');
    }
  }

  get isLive() {
    return this.client !== null;
  }

  async complete<TJson = unknown>(opts: ClaudeCompleteOpts): Promise<ClaudeResult<TJson>> {
    const t0 = Date.now();
    if (!this.client) {
      // Stub path — synchronous, no network. Caller-provided prefill is honored.
      return stubResult<TJson>(opts, this.defaultModel, t0);
    }

    const model = opts.model ?? this.defaultModel;
    const cacheSystem = opts.cacheSystem ?? opts.system.length >= CACHE_THRESHOLD_CHARS;

    // Note: @anthropic-ai/sdk@0.32 doesn't expose cache_control on the
    // stable TextBlockParam yet (it lives on PromptCachingBeta types in this
    // version), but the API accepts it on the standard endpoint. We add the
    // field through an unknown cast to keep types honest.
    const systemBlocks = cacheSystem
      ? ([{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }] as unknown as Anthropic.TextBlockParam[])
      : [{ type: 'text' as const, text: opts.system }];

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: opts.user },
    ];
    if (opts.prefill) {
      messages.push({ role: 'assistant', content: opts.prefill });
    }

    try {
      const resp = await this.client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: systemBlocks,
        messages,
      });

      // Concatenate text blocks (typical: a single block).
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // If we prefilled with `{`, the model output starts AFTER it — re-prepend.
      const fullText = opts.prefill ? opts.prefill + text : text;

      const json = tryParseJson<TJson>(fullText);

      const usage: ClaudeUsage = {
        inputTokens: resp.usage.input_tokens ?? 0,
        outputTokens: resp.usage.output_tokens ?? 0,
        cacheReadTokens: (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        cacheWriteTokens: (resp.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
      };

      return {
        text: fullText,
        json,
        usage,
        latencyMs: Date.now() - t0,
        modelName: model,
        source: 'live',
      };
    } catch (err) {
      this.logger.error('Anthropic call failed, falling back to stub', err as Error);
      return stubResult<TJson>(opts, this.defaultModel, t0);
    }
  }

  // ── Streaming variant of chatStep ────────────────────────────────────────
  // Same contract as chatStep but invokes onTextDelta(chunk) as text is
  // produced. Returns the same ChatStepResult once the response completes.
  // Stub fallback simulates a single message with no streaming effect.

  async chatStepStream(
    opts: {
      system: string;
      history: ChatTurn[];
      tools?: ToolDef[];
      maxTokens?: number;
      cacheSystem?: boolean;
    },
    onTextDelta: (chunk: string) => void,
  ): Promise<ChatStepResult> {
    const t0 = Date.now();
    if (!this.client) {
      const text = '⚠️ AI 助手暂未配置（缺少 ANTHROPIC_API_KEY）。请联系管理员开启 LLM 接入。';
      onTextDelta(text);
      return {
        blocks: [{ type: 'text', text }],
        text,
        toolUses: [],
        stopReason: 'stub',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: Date.now() - t0,
        modelName: `${this.defaultModel}-stub`,
        source: 'stub',
      };
    }

    const cacheSystem = opts.cacheSystem ?? opts.system.length >= CACHE_THRESHOLD_CHARS;
    const systemBlocks = cacheSystem
      ? ([{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }] as unknown as Anthropic.TextBlockParam[])
      : [{ type: 'text' as const, text: opts.system }];

    type AnthropicBlockArray = Array<
      Anthropic.TextBlockParam
      | Anthropic.ImageBlockParam
      | Anthropic.ToolUseBlockParam
      | Anthropic.ToolResultBlockParam
    >;
    const messages: Anthropic.MessageParam[] = opts.history.map((t) => ({
      role: t.role,
      content: typeof t.content === 'string'
        ? t.content
        : (t.content as unknown as AnthropicBlockArray),
    }));

    const stream = this.client.messages.stream({
      model: this.defaultModel,
      max_tokens: opts.maxTokens ?? 2048,
      system: systemBlocks,
      messages,
      ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
    });

    stream.on('text', (delta) => {
      onTextDelta(delta);
    });

    const final = await stream.finalMessage();

    const blocks: ChatBlock[] = final.content.map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      return { type: 'text', text: '' };
    });
    const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    const toolUses = blocks
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
      .map(({ id, name, input }) => ({ id, name, input }));

    return {
      blocks,
      text,
      toolUses,
      stopReason: final.stop_reason ?? null,
      usage: {
        inputTokens: final.usage.input_tokens ?? 0,
        outputTokens: final.usage.output_tokens ?? 0,
        cacheReadTokens: (final.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        cacheWriteTokens: (final.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
      },
      latencyMs: Date.now() - t0,
      modelName: this.defaultModel,
      source: 'live',
    };
  }

  // ── Multi-turn chat with tool use ────────────────────────────────────────

  /**
   * One round of the tool-use loop. Returns text + any tool_use blocks the
   * caller must execute; loop until `toolUses.length === 0`.
   *
   * Stub fallback: returns a canned "AI 助手暂未配置" message so the UI is
   * still functional in dev/no-key environments. Calling code should detect
   * `source === 'stub'` and present the right messaging.
   */
  async chatStep(opts: {
    system: string;
    history: ChatTurn[];
    tools?: ToolDef[];
    maxTokens?: number;
    cacheSystem?: boolean;
  }): Promise<ChatStepResult> {
    const t0 = Date.now();
    if (!this.client) {
      return {
        blocks: [{
          type: 'text',
          text: '⚠️ AI 助手暂未配置（缺少 ANTHROPIC_API_KEY）。请联系管理员开启 LLM 接入。',
        }],
        text: '⚠️ AI 助手暂未配置（缺少 ANTHROPIC_API_KEY）。请联系管理员开启 LLM 接入。',
        toolUses: [],
        stopReason: 'stub',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: Date.now() - t0,
        modelName: `${this.defaultModel}-stub`,
        source: 'stub',
      };
    }

    const cacheSystem = opts.cacheSystem ?? opts.system.length >= CACHE_THRESHOLD_CHARS;
    const systemBlocks = cacheSystem
      ? ([{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }] as unknown as Anthropic.TextBlockParam[])
      : [{ type: 'text' as const, text: opts.system }];

    // Map our internal ChatTurn → Anthropic MessageParam (string OR block array).
    // The SDK's MessageParam.content union is precise; we cast through unknown
    // because our ChatBlock uses snake_case fields that exactly match the wire
    // format the API expects but TS doesn't see them as the same nominal type.
    type AnthropicBlockArray = Array<
      Anthropic.TextBlockParam
      | Anthropic.ImageBlockParam
      | Anthropic.ToolUseBlockParam
      | Anthropic.ToolResultBlockParam
    >;
    const messages: Anthropic.MessageParam[] = opts.history.map((t) => ({
      role: t.role,
      content: typeof t.content === 'string'
        ? t.content
        : (t.content as unknown as AnthropicBlockArray),
    }));

    const resp = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: opts.maxTokens ?? 2048,
      system: systemBlocks,
      messages,
      ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
    });

    const blocks: ChatBlock[] = resp.content.map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      // ignore other block types (image, etc.) — not expected in chat replies
      return { type: 'text', text: '' };
    });

    const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    const toolUses = blocks
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
      .map(({ id, name, input }) => ({ id, name, input }));

    return {
      blocks,
      text,
      toolUses,
      stopReason: resp.stop_reason ?? null,
      usage: {
        inputTokens: resp.usage.input_tokens ?? 0,
        outputTokens: resp.usage.output_tokens ?? 0,
        cacheReadTokens: (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        cacheWriteTokens: (resp.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
      },
      latencyMs: Date.now() - t0,
      modelName: this.defaultModel,
      source: 'live',
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tryParseJson<T>(text: string): T | null {
  // Strip code fences if model wrapped in ```json ... ```
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Find the first {...} or [...] block — model may have lead-in prose.
  const objStart = stripped.indexOf('{');
  const arrStart = stripped.indexOf('[');
  let start = -1;
  if (objStart === -1 && arrStart === -1) return null;
  if (objStart === -1) start = arrStart;
  else if (arrStart === -1) start = objStart;
  else start = Math.min(objStart, arrStart);

  const candidate = stripped.slice(start);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // fall through — try to find the matching close brace by scanning
    return null;
  }
}

function stubResult<T>(opts: ClaudeCompleteOpts, model: string, t0: number): ClaudeResult<T> {
  // Returns the prefill if provided, else `{}` — caller's stub-aware code path
  // (see ai.service heuristic builders) will replace this with a real heuristic.
  const text = opts.prefill ?? '{}';
  return {
    text,
    json: tryParseJson<T>(text),
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    latencyMs: Date.now() - t0,
    modelName: `${model}-stub`,
    source: 'stub',
  };
}
