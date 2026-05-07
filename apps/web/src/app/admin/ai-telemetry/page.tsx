'use client';
// ─── /admin/ai-telemetry ──────────────────────────────────────────────────
// Operational view of AI usage for the current tenant: total insights,
// token spend, latency, cache hit rate, broken down by kind and by day.

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Cpu, Zap, RefreshCw, Loader2, Clock, BarChart3, Activity, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Telemetry {
  totals: {
    insights: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    avgLatencyMs: number;
    liveCount: number;
    stubCount: number;
    cacheHitRate: number;
  };
  byKind: Array<{
    kind: string;
    count: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    avgLatencyMs: number;
  }>;
  byDay: Array<{
    day: string;
    count: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }>;
  since: string;
  windowDays: number;
}

const KIND_ZH: Record<string, string> = {
  OPP_WIN_PROBABILITY: '商机赢单分析',
  OPP_NEXT_BEST_ACTION: '商机下一步建议',
  OPP_ACTIVITY_SUMMARY: '商机时间线总结',
  LEAD_SCORE: '线索评分',
  LEAD_DRAFT_OUTREACH: '线索外联起草',
  ACCOUNT_BRIEFING: '客户 Briefing',
};

const WINDOWS: { days: number; label: string }[] = [
  { days: 7,  label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
];

export default function AiTelemetryPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, refetch } = useQuery<Telemetry>({
    queryKey: ['ai-telemetry', days],
    queryFn: () => aiApi.telemetry(days),
    staleTime: 60_000,
  });

  const scan = useMutation({
    mutationFn: () => aiApi.triggerAnomalyScan(),
    onSettled: () => refetch(),
  });

  const totals = data?.totals;
  const totalTokens = (totals?.promptTokens ?? 0) + (totals?.outputTokens ?? 0);
  const cacheHitPct = totals ? Math.round(totals.cacheHitRate * 100) : 0;

  // Find max for chart scaling
  const maxByDay = useMemo(
    () => Math.max(1, ...(data?.byDay ?? []).map((d) => d.count)),
    [data?.byDay],
  );

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white">
              <Sparkles size={20} />
            </div>
            AI 用量监控
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            当前租户的 AI 调用次数、Token 消耗、延迟、缓存命中率
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 rounded-xl p-1 flex">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() => setDays(w.days)}
                className={cn(
                  'h-9 px-4 rounded-lg text-xs font-black transition-all',
                  days === w.days ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
          >
            {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            立即扫描
          </Button>
        </div>
      </div>

      {/* Top-row totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile
          icon={<Activity size={16} />}
          label="生成洞察数"
          value={String(totals?.insights ?? 0)}
          accent="bg-violet-50 text-violet-600"
          sub={totals ? `${totals.liveCount} 真实 / ${totals.stubCount} 启发式` : ''}
        />
        <StatTile
          icon={<Cpu size={16} />}
          label="总 Token"
          value={fmtNum(totalTokens)}
          accent="bg-indigo-50 text-indigo-600"
          sub={totals ? `输入 ${fmtNum(totals.promptTokens)} · 输出 ${fmtNum(totals.outputTokens)}` : ''}
        />
        <StatTile
          icon={<Zap size={16} />}
          label="缓存命中率"
          value={`${cacheHitPct}%`}
          accent="bg-emerald-50 text-emerald-600"
          sub={totals ? `节省 ${fmtNum(totals.cacheReadTokens)} 输入` : ''}
        />
        <StatTile
          icon={<Clock size={16} />}
          label="平均延迟"
          value={`${totals?.avgLatencyMs ?? 0}ms`}
          accent="bg-amber-50 text-amber-600"
          sub={totals && totals.avgLatencyMs > 8000 ? '偏慢，可考虑缩小输入' : '正常'}
        />
        <StatTile
          icon={<Layers size={16} />}
          label="缓存写入"
          value={fmtNum(totals?.cacheWriteTokens ?? 0)}
          accent="bg-slate-100 text-slate-600"
          sub="prompt 第一次进缓存"
        />
      </div>

      {/* By day chart */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-ink flex items-center gap-2">
              <BarChart3 size={16} className="text-violet-500" />
              每日调用次数
            </h2>
            <span className="text-xs font-bold text-slate-400">
              {data?.windowDays ?? days} 天，共 {data?.byDay.reduce((s, d) => s + d.count, 0) ?? 0} 次
            </span>
          </div>
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-2xl animate-pulse" />
          ) : (
            <div className="flex items-end gap-1 h-32">
              {data?.byDay.map((d) => {
                const h = Math.max(2, Math.round((d.count / maxByDay) * 100));
                return (
                  <div
                    key={d.day}
                    className="flex-1 group relative flex flex-col justify-end"
                    title={`${d.day} · ${d.count} 次 · ${fmtNum(d.promptTokens + d.outputTokens)} tokens`}
                  >
                    <div
                      className={cn(
                        'rounded-t-md transition-colors',
                        d.count > 0 ? 'bg-violet-300 group-hover:bg-violet-500' : 'bg-slate-100',
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 font-mono">
            <span>{data?.byDay[0]?.day}</span>
            <span>{data?.byDay[data.byDay.length - 1]?.day}</span>
          </div>
        </CardContent>
      </Card>

      {/* By kind table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-black text-ink flex items-center gap-2">
              <Layers size={16} className="text-violet-500" />
              按洞察类型分布
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">类型</th>
                <th className="px-6 py-3 text-right">调用次数</th>
                <th className="px-6 py-3 text-right">输入 Token</th>
                <th className="px-6 py-3 text-right">输出 Token</th>
                <th className="px-6 py-3 text-right">缓存读</th>
                <th className="px-6 py-3 text-right">平均延迟</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.byKind ?? []).map((k) => (
                <tr key={k.kind} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="font-black text-ink">{KIND_ZH[k.kind] ?? k.kind}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">{k.kind}</div>
                  </td>
                  <td className="px-6 py-3 text-right font-black text-ink tabular-nums">{k.count}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-600 tabular-nums">{fmtNum(k.promptTokens)}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-600 tabular-nums">{fmtNum(k.outputTokens)}</td>
                  <td className="px-6 py-3 text-right font-bold text-emerald-600 tabular-nums">{fmtNum(k.cacheReadTokens)}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-500 tabular-nums">{k.avgLatencyMs}ms</td>
                </tr>
              ))}
              {(data?.byKind ?? []).length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400 font-bold">
                    本时间段内暂无 AI 调用记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ icon, label, value, accent, sub }: {
  icon: React.ReactNode; label: string; value: string; accent: string; sub?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-100">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent)}>{icon}</div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-black text-ink tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] font-bold text-slate-400 mt-1 truncate">{sub}</div>}
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1) + 'K';
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}
