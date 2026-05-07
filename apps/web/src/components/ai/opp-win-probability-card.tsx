'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { AIInsightShell, NextActionList, ListSection } from './ai-insight-shell';
import type { InsightEnvelope, OppWinProbabilityPayload } from './types';
import { Sparkles, TrendingUp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  opportunityId: string;
}

const BAND_STYLE: Record<string, { ring: string; text: string; bg: string; label: string }> = {
  high:   { ring: 'ring-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', label: '高' },
  medium: { ring: 'ring-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50',   label: '中' },
  low:    { ring: 'ring-red-500',     text: 'text-red-600',     bg: 'bg-red-50',     label: '低' },
};

export function OppWinProbabilityCard({ opportunityId }: Props) {
  const qc = useQueryClient();
  const queryKey = ['ai', 'opp', opportunityId, 'win-probability'];

  const { data, isLoading, error } = useQuery<InsightEnvelope<OppWinProbabilityPayload>>({
    queryKey,
    queryFn: () => aiApi.oppWinProbability(opportunityId),
    enabled: !!opportunityId,
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => aiApi.refreshOppWinProbability(opportunityId),
    onSuccess: (res) => qc.setQueryData(queryKey, res),
  });

  const payload = data?.payload;
  const insight = data?.insight ?? null;

  return (
    <AIInsightShell
      title="AI 赢单分析"
      icon={<Sparkles size={17} />}
      accentClass="bg-violet-100 text-violet-600"
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

function Body({ payload }: { payload: OppWinProbabilityPayload }) {
  const style = BAND_STYLE[payload.band] ?? BAND_STYLE.medium!;

  return (
    <div className="space-y-6">
      {/* Score gauge + headline */}
      <div className="flex items-center gap-5">
        <div className={cn(
          'w-24 h-24 rounded-full ring-4 ring-offset-4 ring-offset-white flex flex-col items-center justify-center shrink-0',
          style.ring,
          style.bg,
        )}>
          <span className={cn('text-3xl font-black tabular-nums', style.text)}>{payload.score}</span>
          <span className={cn('text-[10px] font-black uppercase tracking-wider', style.text)}>{style.label}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">AI 赢单概率</div>
          <p className="text-base font-black text-ink leading-snug">{payload.headline}</p>
          <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">{payload.summary}</p>
        </div>
      </div>

      {/* Strengths + Risks side by side */}
      {(payload.strengths.length > 0 || payload.riskFactors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payload.strengths.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50/60">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">利好</span>
              </div>
              <ListSection title="" items={payload.strengths} iconColor="text-emerald-500" />
            </div>
          )}
          {payload.riskFactors.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-50/60">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert size={14} className="text-red-500" />
                <span className="text-xs font-black text-red-700 uppercase tracking-wider">风险</span>
              </div>
              <ListSection title="" items={payload.riskFactors} iconColor="text-red-500" />
            </div>
          )}
        </div>
      )}

      {/* Next actions */}
      <NextActionList actions={payload.nextActions} />
    </div>
  );
}
