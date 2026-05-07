'use client';
// ─── <AIInsightShell> ────────────────────────────────────────────────────
// The chrome around every AI-generated card. Owns the refresh button, the
// "X 分钟前更新" stamp, the model badge, and the stub/heuristic indicator
// so the user always knows whether they're looking at a real LLM result or
// a fallback heuristic.
//
// Children render the actual payload-specific content.

import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sparkles, RefreshCw, Loader2, Cpu, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InsightMeta } from './types';

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

interface Props {
  title: string;
  /** Lucide icon component or any ReactNode. */
  icon?: ReactNode;
  /** Tailwind classes for the icon's color tint container. */
  accentClass?: string;
  insight: InsightMeta | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  onRefresh: () => void;
  children: ReactNode;
  /** Hide the refresh button (e.g. for read-only viewers). */
  hideRefresh?: boolean;
}

export function AIInsightShell({
  title,
  icon,
  accentClass = 'bg-violet-100 text-violet-600',
  insight,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
  children,
  hideRefresh,
}: Props) {
  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
      <CardHeader className="p-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg font-black flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accentClass)}>
              {icon ?? <Sparkles size={17} />}
            </div>
            <div>
              <div>{title}</div>
              {insight && (
                <div className="text-[11px] font-bold text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{fmtRelative(insight.generatedAt)} 更新</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                  <Cpu size={10} className="text-slate-400" />
                  <span className="font-mono">{insight.modelName.replace('-stub', '')}</span>
                  {insight.source !== 'live' && (
                    <Badge className="h-4 px-1.5 text-[10px] font-bold bg-amber-50 text-amber-700 border-none">
                      {insight.source === 'stub' ? '启发式' : '回退'}
                    </Badge>
                  )}
                  {insight.cached && (
                    <Badge className="h-4 px-1.5 text-[10px] font-bold bg-slate-100 text-slate-500 border-none">
                      缓存
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardTitle>
          {!hideRefresh && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-xl border-slate-200 font-bold gap-1.5 px-3 text-xs"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
            >
              {isRefreshing
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              重新分析
            </Button>
          )}
        </div>
      </CardHeader>
      <Separator className="bg-slate-100" />
      <CardContent className="p-6">
        {isLoading && !insight && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-3/4 bg-slate-100 rounded-lg" />
            <div className="h-4 w-1/2 bg-slate-100 rounded-lg" />
            <div className="h-12 bg-slate-100 rounded-2xl" />
          </div>
        )}
        {!isLoading && Boolean(error) && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="text-sm font-bold">
              <p>AI 分析失败</p>
              <p className="text-xs font-medium text-red-500/80 mt-1">{(error as Error).message ?? String(error)}</p>
            </div>
          </div>
        )}
        {!isLoading && !error && children}
      </CardContent>
    </Card>
  );
}

// ── Generic atoms reused across cards ──────────────────────────────────────

export function ListSection({
  title,
  items,
  iconColor = 'text-slate-400',
  bullet = '•',
}: {
  title: string;
  items: string[];
  iconColor?: string;
  bullet?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-sm font-bold text-ink leading-relaxed flex gap-2">
            <span className={cn('shrink-0 mt-1.5 w-1 h-1 rounded-full', iconColor.replace('text-', 'bg-'))}>
              <span className="sr-only">{bullet}</span>
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NextActionList({
  actions,
}: {
  actions: { action: string; reason: string }[];
}) {
  if (actions.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">建议下一步</p>
      <ol className="space-y-2">
        {actions.map((a, i) => (
          <li
            key={i}
            className="flex items-start gap-3 p-3 rounded-2xl bg-violet-50/60 hover:bg-violet-50 transition-colors"
          >
            <div className="w-6 h-6 rounded-lg bg-violet-500 text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-ink leading-snug">{a.action}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">{a.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
