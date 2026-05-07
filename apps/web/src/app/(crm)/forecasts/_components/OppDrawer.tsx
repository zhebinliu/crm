'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { aiApi } from '@/lib/api';
import { fmtMoney, cn } from '@/lib/utils';

interface Opp { id: string; name: string; stage: string; amount: any; closeDate?: string; owner?: { displayName?: string }; account?: { name?: string } }

const STAGE_LABEL: Record<string, string> = {
  prospecting: '勘探', qualification: '资质评估', needs_analysis: '需求分析',
  value_proposition: '价值主张', proposal: '提案', negotiation: '谈判',
  closed_won: '赢单', closed_lost: '丢单',
};

interface AIBand {
  score: number;
  band: 'low' | 'medium' | 'high';
  headline: string;
  topRisk: string | null;
  topAction: string | null;
}

interface Props { title: string; opps: Opp[]; onClose: () => void }

export function OppDrawer({ title, opps, onClose }: Props) {
  const total = opps.reduce((s, o) => s + Number(o.amount ?? 0), 0);

  // Bulk-fetch cached AI bands for the visible opps in one call.
  const ids = useMemo(() => opps.map((o) => o.id), [opps]);
  const { data: bands } = useQuery<Record<string, AIBand>>({
    queryKey: ['ai-opp-bands', ids.slice().sort().join(',')],
    queryFn: () => aiApi.oppBandsByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[480px] max-h-[60vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-border animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div>
          <p className="font-bold text-ink text-sm">{title}</p>
          <p className="text-xs text-ink-muted mt-0.5">{opps.length} 条商机 · 合计 {fmtMoney(total)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all">
          <X size={15} />
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 divide-y divide-border/50">
        {opps.length === 0 ? (
          <p className="text-center text-ink-muted text-sm py-8">无商机数据</p>
        ) : opps.map((o) => {
          const ai = bands?.[o.id];
          return (
            <div key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/50 transition-colors">
              <AIRiskDot band={ai?.band ?? null} score={ai?.score ?? null} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link href={`/opportunities/${o.id}`} className="font-semibold text-sm text-ink hover:text-brand transition-colors truncate">
                    {o.name}
                  </Link>
                  <Link href={`/opportunities/${o.id}`} target="_blank">
                    <ExternalLink size={11} className="text-slate-300 hover:text-brand shrink-0" />
                  </Link>
                </div>
                <p className="text-xs text-ink-muted truncate">
                  {o.account?.name} · {o.owner?.displayName} · {STAGE_LABEL[o.stage] ?? o.stage}
                </p>
                {ai?.topRisk && ai.band === 'low' && (
                  <p className="text-[11px] text-red-600 font-bold truncate mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={10} className="shrink-0" />
                    {ai.topRisk}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-ink">{fmtMoney(Number(o.amount ?? 0))}</p>
                {o.closeDate && (
                  <p className="text-xs text-ink-muted">
                    {new Date(o.closeDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tiny AI risk indicator — colored dot + score, or grey "?" if unanalyzed.
function AIRiskDot({ band, score }: { band: 'low' | 'medium' | 'high' | null; score: number | null }) {
  if (band == null || score == null) {
    return (
      <div
        className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0"
        title="未进行 AI 分析"
      >
        <Sparkles size={12} />
      </div>
    );
  }
  const cfg =
    band === 'low'    ? { bg: 'bg-red-50',     text: 'text-red-600',     ring: 'ring-red-200' }
    : band === 'medium' ? { bg: 'bg-amber-50',  text: 'text-amber-600',   ring: 'ring-amber-200' }
                       : { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200' };
  return (
    <div
      className={cn('w-9 h-9 rounded-xl ring-1 flex items-center justify-center shrink-0', cfg.bg, cfg.ring)}
      title={`AI 赢单概率 ${score} (${band === 'low' ? '低' : band === 'medium' ? '中' : '高'})`}
    >
      <span className={cn('text-xs font-black tabular-nums', cfg.text)}>{score}</span>
    </div>
  );
}
