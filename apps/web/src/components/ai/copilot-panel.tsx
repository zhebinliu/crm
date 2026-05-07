'use client';
// ─── <CopilotPanel> ────────────────────────────────────────────────────────
// Right-side slide-over panel with the Sales Copilot chat. Conversation is
// persisted to localStorage so the user can re-open the panel and pick up
// where they left off. Tool events are shown collapsed under each assistant
// message so users can audit what the AI actually queried.

import { useEffect, useRef, useState } from 'react';
import { aiApi, type ChatStreamEvent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  X, Sparkles, Send, Loader2, Wrench, ChevronDown, ChevronRight, Trash2, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolEvent {
  name: string;
  input: unknown;
  result: string;
  isError?: boolean;
  durationMs: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  toolEvents?: ToolEvent[];
  /** Local-only timestamp; server doesn't echo this back. */
  ts?: number;
}

interface ChatMeta {
  modelName: string;
  source: 'live' | 'stub';
  totalLatencyMs: number;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface ToolStatus {
  name: string;
  startedAt: number;
  durationMs?: number;
  isError?: boolean;
}

const STORAGE_KEY = 'tw_copilot_history_v1';

const STARTER_PROMPTS = [
  '我的管道整体怎么样？',
  '哪些 deal 有风险，需要立即跟进？',
  '本周关闭日期临近的商机有哪些？',
  '我有哪些热单线索还没跟进？',
  '哪些商机停滞超过两周？',
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** When supplied, the panel auto-sends this as the next user message. */
  forwardedQuery?: string | null;
  onForwardedConsumed?: () => void;
}

export function CopilotPanel({ open, onClose, forwardedQuery, onForwardedConsumed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeTools, setActiveTools] = useState<ToolStatus[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Load on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); // cap
    } catch {}
  }, [messages]);

  // Autoscroll
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, activeTools, open]);

  // Cancel any in-flight stream when the panel unmounts.
  useEffect(() => () => cancelStreamRef.current?.(), []);

  // Auto-send forwarded query (e.g. from CommandPalette "Ask AI" row).
  useEffect(() => {
    if (forwardedQuery && open && !streaming) {
      startStream(forwardedQuery);
      onForwardedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardedQuery, open]);

  function startStream(text: string) {
    if (streaming) return;
    const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    setStreaming(true);
    setStreamingText('');
    setActiveTools([]);

    const history = [...messages, userMsg].slice(-16).map((m) => ({ role: m.role, text: m.text }));
    cancelStreamRef.current = aiApi.chatStream(
      { message: text, history: history.slice(0, -1) /* drop the new user msg, server adds it */ },
      (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'token':
            setStreamingText((prev) => prev + event.text);
            break;
          case 'turn_break':
            // Persist the so-far text into a transient assistant turn? Skip — keep streaming buffer.
            setStreamingText('');
            break;
          case 'tool_call_start':
            setActiveTools((prev) => [...prev, { name: event.name, startedAt: Date.now() }]);
            break;
          case 'tool_call_end':
            setActiveTools((prev) => prev.map((t) =>
              t.name === event.name && t.durationMs == null
                ? { ...t, durationMs: event.durationMs, isError: event.isError }
                : t,
            ));
            break;
          case 'done':
            setMessages((prev) => [...prev, {
              role: 'assistant',
              text: event.assistant.text,
              toolEvents: event.assistant.toolEvents,
              ts: Date.now(),
            }]);
            setMeta(event.meta);
            setStreaming(false);
            setStreamingText('');
            setActiveTools([]);
            cancelStreamRef.current = null;
            break;
          case 'error':
            setMessages((prev) => [...prev, {
              role: 'assistant',
              text: `❌ 调用失败：${event.message}`,
              ts: Date.now(),
            }]);
            setStreaming(false);
            setStreamingText('');
            setActiveTools([]);
            cancelStreamRef.current = null;
            break;
        }
      },
    );
  }

  function handleSubmit() {
    const text = draft.trim();
    if (!text || streaming) return;
    startStream(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter newline
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function clearHistory() {
    setMessages([]);
    setMeta(null);
    setStreamingText('');
    setActiveTools([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function stopStream() {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    setStreaming(false);
    setStreamingText('');
    setActiveTools([]);
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside className={cn(
        'fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-white shadow-2xl flex flex-col',
        'transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-violet-200/50">
              <Sparkles size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-ink leading-tight">小销 · AI 销售助手</h2>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">问管道、找风险、要建议</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="w-8 h-8 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-red-500 flex items-center justify-center transition-colors"
                title="清空对话"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-ink flex items-center justify-center transition-colors"
              title="关闭"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {messages.length === 0 && !streaming && (
            <Welcome onPick={(text) => startStream(text)} />
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {/* Live streaming bubble */}
          {streaming && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-violet-200/50">
                <Sparkles size={13} />
              </div>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white border border-violet-100 px-4 py-2.5 shadow-sm">
                {/* Active tool chips */}
                {activeTools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {activeTools.map((t, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                          t.durationMs == null
                            ? 'bg-violet-100 text-violet-600 animate-pulse'
                            : t.isError
                              ? 'bg-red-50 text-red-600'
                              : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        <Wrench size={9} />
                        {t.name}
                        {t.durationMs != null && <span>· {t.durationMs}ms</span>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Streaming text */}
                {streamingText.length > 0 ? (
                  <div className="text-sm font-medium leading-relaxed text-ink whitespace-pre-wrap">
                    {streamingText}
                    <span className="inline-block w-1 h-4 bg-violet-400 ml-0.5 align-middle animate-pulse" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                    <Loader2 size={12} className="animate-spin text-violet-500" />
                    小销正在思考…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
          {meta && messages.length > 0 && (
            <div className="text-[10px] font-bold text-slate-400 mb-2 flex items-center gap-2 flex-wrap">
              <Cpu size={10} />
              <span className="font-mono">{meta.modelName.replace('-stub', '')}</span>
              {meta.source === 'stub' && (
                <Badge className="h-4 px-1.5 text-[10px] font-bold bg-amber-50 text-amber-700 border-none">未配置 LLM</Badge>
              )}
              <span>·</span>
              <span>{meta.iterations} 步</span>
              <span>·</span>
              <span>{(meta.totalLatencyMs / 1000).toFixed(1)}s</span>
              <span>·</span>
              <span>{meta.inputTokens + meta.outputTokens} tok</span>
            </div>
          )}
          <div className="relative">
            <Textarea
              className="rounded-2xl resize-none pr-12 min-h-[60px] max-h-[180px] font-medium border-slate-200 focus-visible:ring-violet-300"
              placeholder="问问小销…（Enter 发送，Shift+Enter 换行）"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            {streaming ? (
              <Button
                type="button"
                size="sm"
                className="absolute right-2 bottom-2 h-9 w-9 rounded-xl p-0 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200/50"
                onClick={stopStream}
                title="停止"
              >
                <X size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="absolute right-2 bottom-2 h-9 w-9 rounded-xl p-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50 shadow-lg shadow-violet-200/50"
                onClick={handleSubmit}
                disabled={!draft.trim()}
              >
                <Send size={14} />
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Welcome screen with starter prompts ────────────────────────────────────

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-4 py-2">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mx-auto flex items-center justify-center text-white shadow-xl shadow-violet-200/50 mb-3">
          <Sparkles size={22} />
        </div>
        <h3 className="text-base font-black text-ink">你好，我是小销</h3>
        <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed px-4">
          基于你的 CRM 数据，回答管道、商机、客户、线索相关的问题
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">从这里开始</p>
        {STARTER_PROMPTS.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p)}
            className="w-full text-left px-4 py-3 rounded-2xl bg-white border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 transition-all text-sm font-bold text-ink group flex items-center justify-between"
          >
            <span>{p}</span>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Single message bubble ──────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [eventsOpen, setEventsOpen] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-violet-200/50">
          <Sparkles size={13} />
        </div>
      )}
      <div className={cn(
        'max-w-[88%] rounded-2xl px-4 py-2.5',
        isUser
          ? 'bg-ink text-white rounded-tr-sm'
          : 'bg-white border border-slate-100 text-ink rounded-tl-sm',
      )}>
        <div className={cn(
          'text-sm font-medium leading-relaxed whitespace-pre-wrap',
          isUser ? 'text-white' : 'text-ink',
        )}>
          {message.text}
        </div>

        {/* Tool events (collapsed by default) */}
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEventsOpen((v) => !v)}
              className="text-[10px] font-bold text-slate-400 hover:text-violet-500 flex items-center gap-1"
            >
              {eventsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Wrench size={10} />
              查询了 {message.toolEvents.length} 次数据
            </button>
            {eventsOpen && (
              <div className="mt-2 space-y-1">
                {message.toolEvents.map((ev, i) => (
                  <div
                    key={i}
                    className={cn(
                      'text-[10px] font-mono px-2 py-1.5 rounded-lg',
                      ev.isError ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500',
                    )}
                  >
                    <div className="font-bold">
                      {ev.name}({Object.keys((ev.input as object) ?? {}).map((k) => `${k}=${JSON.stringify((ev.input as Record<string, unknown>)[k])}`).join(', ')})
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{ev.durationMs}ms</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
