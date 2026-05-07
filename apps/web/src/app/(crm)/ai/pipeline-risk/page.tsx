'use client';
// ─── /ai/pipeline-risk ────────────────────────────────────────────────────
// Manager-facing dashboard listing all open opportunities ranked by AI
// win-probability ascending (worst first). For unanalyzed deals, the user
// can fire the per-row analyze button or "全部分析" to batch-trigger
// generation. Cached insights are reused; the LLM is only called for opps
// without cache.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { fmtMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, RefreshCw, AlertTriangle, ShieldCheck, Activity,
  ChevronRight, TrendingUp, Building2, Calendar, AlertOctagon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineRiskItem {
  opportunity: {
    id: string;
    name: string;
    stage: string;
    amount: number | null;
    currencyCode: string;
    closeDate: string;
    daysToClose: number;
    owner: { id: string; displayName: string } | null;
    account: { id: string; name: string } | null;
    probability: number;
  };
  insight: {
    score: number;
    band: 'low' | 'medium' | 'high';
    headline: string;
    riskFactors: string[];
    nextActions: { action: string; reason: string }[];
    generatedAt: string;
    modelName: string;
    cached: boolean;
    source: 'live' | 'stub';
  } | null;
}

interface PipelineRiskResponse {
  items: PipelineRiskItem[];
  stats: {
    total: number;
    analyzed: number;
    highRisk: number;
    mediumRisk: number;
    healthy: number;
    unanalyzed: number;
    totalAmount: number;
    atRiskAmount: number;
  };
}

const STAGE_ZH: Record<string, string> = {
  prospecting: '初步接触',
  qualification: '潜在资质',
  needs_analysis: '方案需求',
  value_proposition: '价值主张',
  proposal: '正式提案',
  negotiation: '商务谈判',
};

export default function PipelineRiskPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'high-risk' | 'unanalyzed'>('all');
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<PipelineRiskResponse>({
    queryKey: ['ai', 'pipeline-risk'],
    queryFn: () => aiApi.pipelineRisk(),
    staleTime: 30_000,
  });

  const analyzeOne = async (oppId: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(oppId));
    try {
      await aiApi.refreshOppWinProbability(oppId);
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(oppId);
        return next;
      });
      qc.invalidateQueries({ queryKey: ['ai', 'pipeline-risk'] });
    }
  };

  const analyzeAll = useMutation({
    mutationFn: async (ids: string[]) => {
      // Limit concurrency to 3 to stay friendly with rate limits.
      setAnalyzingIds(new Set(ids));
      const queue = [...ids];
      const workers = Array.from({ length: 3 }, async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) return;
          try {
            await aiApi.refreshOppWinProbability(id);
          } catch {
            // continue with the rest
          } finally {
            setAnalyzingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        }
      });
      await Promise.all(workers);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai', 'pipeline-risk'] }),
  });

  const items = data?.items ?? [];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'high-risk') return items.filter((it) => it.insight?.band === 'low');
    return items.filter((it) => !it.insight);
  }, [items, filter]);

  const unanalyzedIds = items.filter((it) => !it.insight).map((it) => it.opportunity.id);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white">
              <Sparkles size={20} />
            </div>
            AI 风险看板
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            按 AI 赢单概率从低到高排列，识别需要立即介入的商机
          </p>
        </div>
        {unanalyzedIds.length > 0 && (
          <Button
            className="h-11 px-5 rounded-2xl font-black bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white gap-2 shadow-xl shadow-violet-200/50"
            onClick={() => analyzeAll.mutate(unanalyzedIds)}
            disabled={analyzeAll.isPending}
          >
            {analyzeAll.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : <Sparkles size={16} />}
            分析全部 ({unanalyzedIds.length})
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile icon={<TrendingUp size={16} />} label="进行中" value={String(stats.total)} accent="bg-slate-100 text-slate-600" sub={fmtMoney(stats.totalAmount)} />
          <StatTile icon={<AlertOctagon size={16} />} label="高风险" value={String(stats.highRisk)} accent="bg-red-50 text-red-600" sub={`${fmtMoney(stats.atRiskAmount)} 在险`} />
          <StatTile icon={<AlertTriangle size={16} />} label="中风险" value={String(stats.mediumRisk)} accent="bg-amber-50 text-amber-600" />
          <StatTile icon={<ShieldCheck size={16} />} label="健康" value={String(stats.healthy)} accent="bg-emerald-50 text-emerald-600" />
          <StatTile icon={<Activity size={16} />} label="未分析" value={String(stats.unanalyzed)} accent="bg-violet-50 text-violet-600" />
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>全部</FilterChip>
        <FilterChip active={filter === 'high-risk'} onClick={() => setFilter('high-risk')} variant="danger">仅高风险</FilterChip>
        <FilterChip active={filter === 'unanalyzed'} onClick={() => setFilter('unanalyzed')} variant="violet">仅未分析</FilterChip>
      </div>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={24} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-3">加载中…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={24} className="text-slate-300" />
              </div>
              <p className="text-base font-black text-slate-400">没有符合条件的商机</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((it) => (
                <PipelineRow
                  key={it.opportunity.id}
                  item={it}
                  isAnalyzing={analyzingIds.has(it.opportunity.id)}
                  onAnalyze={() => analyzeOne(it.opportunity.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────────

function StatTile({ icon, label, value, accent, sub }: {
  icon: React.ReactNode; label: string; value: string; accent: string; sub?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent)}>
          {icon}
        </div>
        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-black text-ink tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────

function FilterChip({
  active, onClick, children, variant = 'default',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'danger' | 'violet';
}) {
  const activeClass = variant === 'danger'
    ? 'bg-red-500 text-white'
    : variant === 'violet'
      ? 'bg-violet-500 text-white'
      : 'bg-ink text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-4 rounded-full text-xs font-black transition-all',
        active ? activeClass : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
      )}
    >
      {children}
    </button>
  );
}

// ── Pipeline row ──────────────────────────────────────────────────────────

function PipelineRow({
  item, isAnalyzing, onAnalyze,
}: {
  item: PipelineRiskItem;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}) {
  const { opportunity: opp, insight } = item;
  const overdue = opp.daysToClose < 0;
  return (
    <li className="px-6 py-5 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-start gap-5">
        {/* Score badge */}
        <ScoreBadge score={insight?.score ?? null} band={insight?.band ?? null} />

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Link
              href={`/opportunities/${opp.id}`}
              className="text-base font-black text-ink hover:text-brand transition-colors truncate"
            >
              {opp.name}
            </Link>
            <Badge variant="outline" className="border-none bg-slate-100 text-slate-600 font-bold text-[10px]">
              {STAGE_ZH[opp.stage] ?? opp.stage}
            </Badge>
            {overdue && (
              <Badge className="border-none bg-red-50 text-red-600 font-bold text-[10px] gap-1">
                <AlertOctagon size={10} />
                已过期 {-opp.daysToClose} 天
              </Badge>
            )}
          </div>

          {insight ? (
            <p className="text-sm font-bold text-slate-600 leading-snug mb-2">{insight.headline}</p>
          ) : (
            <p className="text-sm font-medium text-slate-400 mb-2">尚未分析，点击右侧按钮生成 AI 评估</p>
          )}

          {/* Top risk factor + next action */}
          {insight && insight.riskFactors[0] && (
            <div className="text-xs text-red-600 font-bold mb-1 flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{insight.riskFactors[0]}</span>
            </div>
          )}
          {insight && insight.nextActions[0] && (
            <div className="text-xs text-violet-600 font-bold flex items-start gap-1.5">
              <ChevronRight size={11} className="mt-0.5 shrink-0" />
              <span><span className="font-black">建议：</span>{insight.nextActions[0].action}</span>
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 flex-wrap mt-2.5">
            {opp.account && (
              <span className="flex items-center gap-1">
                <Building2 size={10} />{opp.account.name}
              </span>
            )}
            {opp.owner && (
              <span>{opp.owner.displayName}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {opp.closeDate}
              {!overdue && opp.daysToClose <= 30 && (
                <span className={cn('ml-1', opp.daysToClose <= 7 ? 'text-red-500' : 'text-amber-600')}>
                  ({opp.daysToClose} 天)
                </span>
              )}
            </span>
            {opp.amount != null && (
              <span className="font-black text-ink tabular-nums">{fmtMoney(opp.amount)}</span>
            )}
          </div>
        </div>

        {/* Action button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-xl font-bold gap-1 px-3 text-xs shrink-0"
          onClick={onAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing
            ? <Loader2 size={11} className="animate-spin" />
            : insight ? <RefreshCw size={11} /> : <Sparkles size={11} />}
          {isAnalyzing ? '分析中' : insight ? '重新分析' : '分析'}
        </Button>
      </div>
    </li>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────

function ScoreBadge({ score, band }: { score: number | null; band: 'low' | 'medium' | 'high' | null }) {
  if (score == null || band == null) {
    return (
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex flex-col items-center justify-center text-slate-400 shrink-0">
        <Sparkles size={14} className="mb-0.5" />
        <span className="text-[9px] font-black uppercase tracking-wider">未分析</span>
      </div>
    );
  }
  const cfg = band === 'low'
    ? { bg: 'bg-red-50',     text: 'text-red-600',     ring: 'ring-red-200',     label: '低' }
    : band === 'medium'
      ? { bg: 'bg-amber-50',  text: 'text-amber-600',  ring: 'ring-amber-200',  label: '中' }
      : { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200', label: '高' };
  return (
    <div className={cn(
      'w-14 h-14 rounded-2xl ring-2 flex flex-col items-center justify-center shrink-0',
      cfg.bg, cfg.ring,
    )}>
      <span className={cn('text-xl font-black tabular-nums leading-none', cfg.text)}>{score}</span>
      <span className={cn('text-[9px] font-black uppercase tracking-wider mt-0.5', cfg.text)}>{cfg.label}</span>
    </div>
  );
}
