'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import { fmtMoney } from '@/lib/utils';
import { AIInsightShell, ListSection } from './ai-insight-shell';
import type { InsightEnvelope, AccountBriefingPayload } from './types';
import {
  Briefcase, Building2, TrendingUp, ShieldAlert, Target, ChevronRight,
} from 'lucide-react';

interface Props {
  accountId: string;
}

export function AccountBriefingCard({ accountId }: Props) {
  const qc = useQueryClient();
  const queryKey = ['ai', 'account', accountId, 'briefing'];

  const { data, isLoading, error } = useQuery<InsightEnvelope<AccountBriefingPayload>>({
    queryKey,
    queryFn: () => aiApi.accountBriefing(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => aiApi.refreshAccountBriefing(accountId),
    onSuccess: (res) => qc.setQueryData(queryKey, res),
  });

  const payload = data?.payload;
  const insight = data?.insight ?? null;

  return (
    <AIInsightShell
      title="客户 60 秒 Briefing"
      icon={<Briefcase size={17} />}
      accentClass="bg-indigo-100 text-indigo-600"
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

function Body({ payload }: { payload: AccountBriefingPayload }) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="p-4 rounded-2xl bg-indigo-50/60 text-sm font-bold text-ink leading-relaxed">
        {payload.summary}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-slate-50/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-500">
            <TrendingUp size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">活跃商机</p>
            <p className="text-lg font-black text-ink tabular-nums leading-tight">{payload.openOppsCount}</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-50/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-brand">
            <Building2 size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">在谈金额</p>
            <p className="text-lg font-black text-ink tabular-nums leading-tight truncate">
              {payload.totalOpenAmount > 0 ? fmtMoney(payload.totalOpenAmount) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Latest signals */}
      {payload.latestSignals.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">最新动态</p>
          <ul className="space-y-1.5">
            {payload.latestSignals.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm font-bold text-ink leading-relaxed">
                <ChevronRight size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks + Opportunities */}
      {(payload.risks.length > 0 || payload.opportunities.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payload.risks.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-50/60">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert size={14} className="text-red-500" />
                <span className="text-xs font-black text-red-700 uppercase tracking-wider">风险信号</span>
              </div>
              <ListSection title="" items={payload.risks} iconColor="text-red-500" />
            </div>
          )}
          {payload.opportunities.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50/60">
              <div className="flex items-center gap-2 mb-3">
                <Target size={14} className="text-emerald-500" />
                <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">拓展机会</span>
              </div>
              <ListSection title="" items={payload.opportunities} iconColor="text-emerald-500" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
