'use client';
// ─── <DashboardAIBanner> ────────────────────────────────────────────────
// Top-of-dashboard banner that surfaces high-risk opportunities flagged by
// the daily anomaly scan. Designed to be the first thing a sales manager
// sees in the morning. Empty state hides the banner gracefully.

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { fmtMoney, cn } from '@/lib/utils';
import { Sparkles, AlertOctagon, ChevronRight, ShieldCheck } from 'lucide-react';

interface HighRiskItem {
  opportunityId: string;
  name: string;
  amount: number | null;
  score: number;
  headline: string;
  topRisk: string | null;
  topAction: string | null;
  generatedAt: string;
}

interface Summary {
  totalOpen: number;
  analyzed: number;
  coverage: number;
  highRisk: { count: number; amount: number; items: HighRiskItem[] };
  recentlyFlagged: HighRiskItem[];
}

export function DashboardAIBanner() {
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ['ai-dashboard-summary'],
    queryFn: () => aiApi.dashboardSummary(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 animate-pulse">
        <div className="h-5 w-40 bg-violet-100 rounded-lg mb-3" />
        <div className="h-4 w-3/4 bg-violet-100 rounded-lg" />
      </div>
    );
  }

  if (!data || data.totalOpen === 0) return null;

  const { highRisk, totalOpen, analyzed, coverage } = data;
  const noRisk = highRisk.count === 0 && analyzed > 0;

  return (
    <div className="rounded-3xl overflow-hidden shadow-xl shadow-violet-100/50">
      {/* Header bar */}
      <div className={cn(
        'px-6 py-4 flex items-center justify-between',
        highRisk.count > 0
          ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500'
          : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500',
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
            {highRisk.count > 0 ? <AlertOctagon size={19} /> : <Sparkles size={19} />}
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              {highRisk.count > 0
                ? `${highRisk.count} 个高风险商机需要立即关注`
                : noRisk
                  ? '管道整体健康'
                  : 'AI 风险扫描'}
            </h2>
            <p className="text-xs text-white/80 font-medium">
              {highRisk.count > 0
                ? `合计 ${fmtMoney(highRisk.amount)} 在险 · 已分析 ${analyzed}/${totalOpen}（${coverage}%）`
                : noRisk
                  ? `已分析 ${analyzed}/${totalOpen} 个进行中商机，无高风险标记`
                  : `${totalOpen} 个进行中商机，已分析 ${analyzed} 个（${coverage}%）`}
            </p>
          </div>
        </div>
        <Link
          href="/ai/pipeline-risk"
          className="hidden sm:flex items-center gap-1 text-xs font-black text-white/90 hover:text-white px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
        >
          打开风险看板 <ChevronRight size={12} />
        </Link>
      </div>

      {/* Body */}
      {highRisk.count > 0 ? (
        <div className="bg-white p-5 space-y-2">
          {highRisk.items.slice(0, 3).map((it) => (
            <Link
              key={it.opportunityId}
              href={`/opportunities/${it.opportunityId}`}
              className="flex items-center gap-3 p-3 rounded-2xl hover:bg-red-50/50 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl ring-2 ring-red-200 bg-red-50 flex flex-col items-center justify-center shrink-0">
                <span className="text-base font-black text-red-600 tabular-nums leading-none">{it.score}</span>
                <span className="text-[9px] font-black text-red-600 mt-0.5">低</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-ink truncate group-hover:text-brand transition-colors">{it.name}</p>
                {it.topRisk && (
                  <p className="text-xs text-red-600 font-bold mt-0.5 truncate">⚠ {it.topRisk}</p>
                )}
                {it.topAction && (
                  <p className="text-xs text-violet-600 font-bold mt-0.5 truncate">→ {it.topAction}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {it.amount != null && (
                  <p className="text-sm font-black text-ink tabular-nums">{fmtMoney(it.amount)}</p>
                )}
              </div>
              <ChevronRight size={14} className="text-slate-300 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
          {highRisk.count > 3 && (
            <Link
              href="/ai/pipeline-risk"
              className="block text-center text-xs font-bold text-violet-500 hover:text-violet-600 py-2"
            >
              还有 {highRisk.count - 3} 个高风险商机 →
            </Link>
          )}
        </div>
      ) : noRisk ? (
        <div className="bg-white p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <ShieldCheck size={18} />
          </div>
          <p className="text-sm font-bold text-ink">所有进行中商机均处于中或高赢率，保持节奏即可。</p>
        </div>
      ) : (
        <div className="bg-white p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">还有 {totalOpen - analyzed} 个商机未进行 AI 分析</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">点击右侧按钮一次性扫描全部</p>
          </div>
          <Link
            href="/ai/pipeline-risk"
            className="text-xs font-black text-white px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-md"
          >
            打开风险看板
          </Link>
        </div>
      )}
    </div>
  );
}
