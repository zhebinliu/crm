'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { AIInsightShell, NextActionList, ListSection } from './ai-insight-shell';
import type { InsightEnvelope, LeadScorePayload } from './types';
import { Flame, ThermometerSun, Snowflake, Target, Building2, AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string;
  /** Invalidate parent caches when score changes (lead.score and rating are mirrored). */
  onScoreChanged?: () => void;
}

const BAND_STYLE: Record<string, { icon: typeof Flame; ring: string; text: string; bg: string; label: string }> = {
  hot:  { icon: Flame,          ring: 'ring-red-500',     text: 'text-red-600',     bg: 'bg-red-50',     label: '热单' },
  warm: { icon: ThermometerSun, ring: 'ring-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50',   label: '温单' },
  cold: { icon: Snowflake,      ring: 'ring-sky-500',     text: 'text-sky-600',     bg: 'bg-sky-50',     label: '冷单' },
};

export function LeadScoreCard({ leadId, onScoreChanged }: Props) {
  const qc = useQueryClient();
  const queryKey = ['ai', 'lead', leadId, 'score'];

  const { data, isLoading, error } = useQuery<InsightEnvelope<LeadScorePayload>>({
    queryKey,
    queryFn: () => aiApi.leadScore(leadId),
    enabled: !!leadId,
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => aiApi.refreshLeadScore(leadId),
    onSuccess: (res) => {
      qc.setQueryData(queryKey, res);
      onScoreChanged?.();
    },
  });

  const payload = data?.payload;
  const insight = data?.insight ?? null;

  return (
    <AIInsightShell
      title="AI 线索评分"
      icon={<Flame size={17} />}
      accentClass="bg-rose-100 text-rose-600"
      insight={insight}
      isLoading={isLoading}
      isRefreshing={refresh.isPending}
      error={error}
      onRefresh={() => refresh.mutate()}
    >
      {payload && <Body payload={payload} />}
    </AIInsightShell>
  );
}

function Body({ payload }: { payload: LeadScorePayload }) {
  const style = BAND_STYLE[payload.band] ?? BAND_STYLE.warm!;
  const Icon = style.icon;

  return (
    <div className="space-y-6">
      {/* Score gauge + reasoning */}
      <div className="flex items-center gap-5">
        <div className={cn(
          'w-24 h-24 rounded-full ring-4 ring-offset-4 ring-offset-white flex flex-col items-center justify-center shrink-0',
          style.ring,
          style.bg,
        )}>
          <Icon size={20} className={cn('mb-0.5', style.text)} />
          <span className={cn('text-2xl font-black tabular-nums leading-none', style.text)}>{payload.score}</span>
          <span className={cn('text-[10px] font-black uppercase tracking-wider mt-0.5', style.text)}>{style.label}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">综合评分</div>
          <p className="text-sm font-bold text-ink leading-relaxed">{payload.reasoning}</p>
        </div>
      </div>

      {/* Sub-score breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <SubScoreBar
          icon={<Building2 size={13} />}
          label="公司适配"
          value={payload.fitScore}
          colorClass="bg-indigo-500"
        />
        <SubScoreBar
          icon={<Target size={13} />}
          label="购买意向"
          value={payload.intentScore}
          colorClass="bg-rose-500"
        />
      </div>

      {/* Qualifiers + Blockers */}
      {(payload.qualifiers.length > 0 || payload.blockers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payload.qualifiers.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50/60">
              <div className="flex items-center gap-2 mb-3">
                <Check size={14} className="text-emerald-500" />
                <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">资质亮点</span>
              </div>
              <ListSection title="" items={payload.qualifiers} iconColor="text-emerald-500" />
            </div>
          )}
          {payload.blockers.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/60">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider">需要补强</span>
              </div>
              <ListSection title="" items={payload.blockers} iconColor="text-amber-500" />
            </div>
          )}
        </div>
      )}

      {/* Next actions */}
      <NextActionList actions={payload.nextActions} />
    </div>
  );
}

function SubScoreBar({ icon, label, value, colorClass }: {
  icon: React.ReactNode; label: string; value: number; colorClass: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-slate-50/80">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">{icon}</span>
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-sm font-black text-ink tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
