'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { AIInsightShell, NextActionList } from './ai-insight-shell';
import type { InsightEnvelope, OppActivitySummaryPayload } from './types';
import { Activity, Smile, Meh, Frown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  opportunityId: string;
}

const SENTIMENT_STYLE: Record<string, { icon: typeof Smile; bg: string; text: string; label: string }> = {
  positive: { icon: Smile, bg: 'bg-emerald-50',  text: 'text-emerald-600', label: '积极' },
  neutral:  { icon: Meh,   bg: 'bg-slate-50',    text: 'text-slate-500',   label: '平稳' },
  negative: { icon: Frown, bg: 'bg-red-50',      text: 'text-red-500',     label: '消极' },
};

export function OppActivitySummaryCard({ opportunityId }: Props) {
  const qc = useQueryClient();
  const queryKey = ['ai', 'opp', opportunityId, 'activity-summary'];

  const { data, isLoading, error } = useQuery<InsightEnvelope<OppActivitySummaryPayload>>({
    queryKey,
    queryFn: () => aiApi.oppActivitySummary(opportunityId),
    enabled: !!opportunityId,
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => aiApi.refreshOppActivitySummary(opportunityId),
    onSuccess: (res) => qc.setQueryData(queryKey, res),
  });

  const payload = data?.payload;
  const insight = data?.insight ?? null;

  return (
    <AIInsightShell
      title="AI 时间线总结"
      icon={<Activity size={17} />}
      accentClass="bg-cyan-100 text-cyan-600"
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

function Body({ payload }: { payload: OppActivitySummaryPayload }) {
  const sentiment = SENTIMENT_STYLE[payload.sentiment] ?? SENTIMENT_STYLE.neutral!;
  const Icon = sentiment.icon;

  return (
    <div className="space-y-5">
      {/* Sentiment + last activity */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('p-4 rounded-2xl flex items-center gap-3', sentiment.bg)}>
          <Icon size={20} className={sentiment.text} />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">客户情绪</p>
            <p className={cn('text-sm font-black', sentiment.text)}>{sentiment.label}</p>
          </div>
        </div>
        <div className={cn(
          'p-4 rounded-2xl flex items-center gap-3',
          payload.isStalled ? 'bg-amber-50' : 'bg-slate-50',
        )}>
          <Clock size={20} className={payload.isStalled ? 'text-amber-600' : 'text-slate-500'} />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">最近互动</p>
            <p className={cn('text-sm font-black', payload.isStalled ? 'text-amber-700' : 'text-ink')}>
              {payload.daysSinceLastActivity == null
                ? '从未互动'
                : payload.daysSinceLastActivity === 0
                  ? '今天'
                  : `${payload.daysSinceLastActivity} 天前`}
              {payload.isStalled && <span className="text-[11px] ml-1.5">· 停滞</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Summary text */}
      <div className="p-4 rounded-2xl bg-slate-50/80 text-sm font-bold text-ink leading-relaxed">
        {payload.summary}
      </div>

      {/* Suggestions */}
      <NextActionList actions={payload.suggestions} />
    </div>
  );
}
