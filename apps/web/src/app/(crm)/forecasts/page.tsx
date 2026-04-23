'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { oppsApi, forecastApi, adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { fmtMoney, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  TrendingUp, ChevronLeft, ChevronRight, Target,
  BarChart2, Users, User, Star, CheckCircle2,
  Layers, Check, X, RefreshCw, Settings2, Trophy,
  CalendarDays, Calendar,
} from 'lucide-react';
import { OppDrawer } from './_components/OppDrawer';
import { ForecastConfigModal } from './_components/ForecastConfigModal';
import { UpdateTasksPanel } from './_components/UpdateTasksPanel';

// ── Stage & category metadata ─────────────────────────────────────────────────

const STAGE_PROB: Record<string, number> = {
  prospecting: 10, qualification: 20, needs_analysis: 30,
  value_proposition: 50, proposal: 65, negotiation: 80,
  closed_won: 100, closed_lost: 0,
};

const STAGE_LABEL: Record<string, string> = {
  prospecting: '勘探', qualification: '资质评估', needs_analysis: '需求分析',
  value_proposition: '价值主张', proposal: '提案', negotiation: '谈判',
  closed_won: '赢单', closed_lost: '丢单',
};

const STAGE_ORDER = [
  'prospecting','qualification','needs_analysis',
  'value_proposition','proposal','negotiation','closed_won','closed_lost',
];

type ForecastCat = 'pipeline' | 'best_case' | 'commit' | 'closed';

const CAT_CONFIG: Record<ForecastCat, {
  label: string; desc: string;
  bg: string; text: string; border: string;
}> = {
  pipeline:  { label: '流水线',  desc: '所有非丢单商机',   bg: 'bg-info-light',    text: 'text-info-text',    border: 'border-info/20' },
  best_case: { label: '最佳预期', desc: '价值主张＋提案＋承诺＋赢单', bg: 'bg-warning-light', text: 'text-warning-text', border: 'border-warning/20' },
  commit:    { label: '已承诺',  desc: '谈判阶段可关闭',   bg: 'bg-brand-light',   text: 'text-brand-deep',   border: 'border-brand/20' },
  closed:    { label: '已赢单',  desc: '本期已确认赢单',   bg: 'bg-success-light', text: 'text-success-text', border: 'border-success/20' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getQuarter(d: Date) { return Math.floor(d.getMonth() / 3) + 1; }

function quarterRange(year: number, q: number): [Date, Date] {
  return [
    new Date(year, (q - 1) * 3, 1),
    new Date(year, q * 3, 0, 23, 59, 59),
  ];
}

function monthRange(year: number, month: number): [Date, Date] {
  return [
    new Date(year, month, 1),
    new Date(year, month + 1, 0, 23, 59, 59),
  ];
}

function toNum(v: unknown): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function periodKey(year: number, q: number) { return `${year}-Q${q}`; }
function pctBar(value: number, quota: number) {
  if (!quota) return 0;
  return Math.min(Math.round((value / quota) * 100), 100);
}

// Build waterfall totals from opps + category config
// pipeline = all non-omitted; best_case = cumulative above pipeline; commit = cumulative; closed = closed only
function buildTotals(
  opps: any[],
  stageCategories: Record<string, string>,
): Record<ForecastCat, { amount: number; count: number; opps: any[] }> {
  const catMap: Record<string, any[]> = { pipeline: [], best_case: [], commit: [], closed: [], omitted: [] };
  for (const o of opps) {
    const cat = stageCategories[o.stage] ?? 'pipeline';
    catMap[cat] = catMap[cat] ?? [];
    catMap[cat].push(o);
  }
  // Waterfall: pipeline includes all non-omitted; best_case = best_case+commit+closed; commit = commit+closed
  const all_non_omitted = [...(catMap.pipeline ?? []), ...(catMap.best_case ?? []), ...(catMap.commit ?? []), ...(catMap.closed ?? [])];
  const best_case_up = [...(catMap.best_case ?? []), ...(catMap.commit ?? []), ...(catMap.closed ?? [])];
  const commit_up = [...(catMap.commit ?? []), ...(catMap.closed ?? [])];
  const closed = catMap.closed ?? [];

  const sum = (arr: any[]) => arr.reduce((s, o) => s + toNum(o.amount), 0);
  return {
    pipeline:  { amount: sum(all_non_omitted), count: all_non_omitted.length, opps: all_non_omitted },
    best_case: { amount: sum(best_case_up),    count: best_case_up.length,    opps: best_case_up },
    commit:    { amount: sum(commit_up),        count: commit_up.length,        opps: commit_up },
    closed:    { amount: sum(closed),           count: closed.length,           opps: closed },
  };
}

// ── Quota edit modal ─────────────────────────────────────────────────────────

function QuotaModal({
  open, userName, current, saving,
  onClose, onSave,
}: {
  open: boolean; userName: string; current: number; saving?: boolean;
  onClose: () => void; onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState('');
  if (!open) return null;
  function handleSave() {
    const v = toNum(draft);
    if (v >= 0) { onSave(v); onClose(); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-border w-full max-w-sm mx-4 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-ink">设置季度目标</h2>
            <p className="text-xs text-ink-muted mt-0.5">{userName} · 当前配额：{fmtMoney(current)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">新配额金额（元）</label>
          <input
            autoFocus type="number" min={0}
            placeholder={String(current || 1000000)}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="w-full px-4 py-3 rounded-xl border border-border bg-surface-secondary text-ink font-bold text-lg outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
          />
          {draft && toNum(draft) > 0 && <p className="text-xs text-ink-muted pl-1">{fmtMoney(toNum(draft))}</p>}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave} disabled={saving || !draft || toNum(draft) < 0}
            className="flex-1 btn-primary text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            保存目标
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-ink-secondary hover:text-ink text-sm font-bold transition-all">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Monthly stats table (F1) ─────────────────────────────────────────────────

function MonthlyTable({
  year, quarter, opps, stageCategories, onCellClick,
}: {
  year: number; quarter: number;
  opps: any[];
  stageCategories: Record<string, string>;
  onCellClick: (title: string, opps: any[]) => void;
}) {
  const months = [0, 1, 2].map((i) => (quarter - 1) * 3 + i); // 0-indexed months

  const monthData = useMemo(() => months.map((month) => {
    const [from, to] = monthRange(year, month);
    const monthOpps = opps.filter((o) => {
      if (!o.closeDate) return false;
      const d = new Date(o.closeDate);
      return d >= from && d <= to;
    });
    return { month, totals: buildTotals(monthOpps, stageCategories) };
  }), [year, quarter, opps, stageCategories]);

  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const cats: ForecastCat[] = ['pipeline', 'best_case', 'commit', 'closed'];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
        <CalendarDays size={16} className="text-brand" />
        <h3 className="font-bold text-ink text-sm">按月统计 · Q{quarter} {year}</h3>
        <p className="text-xs text-ink-muted ml-2">点击金额查看构成商机</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary/60">
              <th className="text-left px-5 py-3 text-xs font-bold text-ink-secondary uppercase tracking-wider w-20">月份</th>
              {cats.map((cat) => (
                <th key={cat} className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider">
                  <span className={cn('badge', CAT_CONFIG[cat].bg, CAT_CONFIG[cat].text)}>
                    {CAT_CONFIG[cat].label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthData.map(({ month, totals }) => (
              <tr key={month} className="border-b border-border/40 hover:bg-surface-secondary/30 transition-colors">
                <td className="px-5 py-3 font-semibold text-ink text-sm">{MONTH_NAMES[month]}</td>
                {cats.map((cat) => {
                  const t = totals[cat];
                  return (
                    <td key={cat} className="px-4 py-3 text-right">
                      {t.count > 0 ? (
                        <button
                          onClick={() => onCellClick(
                            `${MONTH_NAMES[month]} · ${CAT_CONFIG[cat].label}`,
                            t.opps,
                          )}
                          className={cn(
                            'inline-flex flex-col items-end gap-0.5 rounded-xl px-2 py-1 transition-all hover:ring-2',
                            `hover:${CAT_CONFIG[cat].border.replace('border-','ring-')}`,
                          )}
                        >
                          <span className="font-bold text-sm text-ink">{fmtMoney(t.amount)}</span>
                          <span className="text-[10px] text-ink-muted">{t.count} 条</span>
                        </button>
                      ) : (
                        <span className="text-xs text-ink-muted/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Totals row */}
            {(() => {
              const allTotals = buildTotals(opps, stageCategories);
              return (
                <tr className="bg-surface-secondary/60 font-bold">
                  <td className="px-5 py-3 text-xs font-black text-ink-secondary uppercase tracking-wider">合计</td>
                  {cats.map((cat) => {
                    const t = allTotals[cat];
                    return (
                      <td key={cat} className="px-4 py-3 text-right">
                        <button
                          onClick={() => onCellClick(`${CAT_CONFIG[cat].label}（全季度）`, t.opps)}
                          className={cn('inline-flex flex-col items-end gap-0.5 rounded-xl px-2 py-1 transition-all hover:ring-2', `hover:${CAT_CONFIG[cat].border.replace('border-','ring-')}`)}
                        >
                          <span className="font-black text-sm text-ink">{fmtMoney(t.amount)}</span>
                          <span className="text-[10px] text-ink-muted">{t.count} 条</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ForecastsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(getQuarter(now));
  const [view, setView] = useState<'mine' | 'team'>('mine');
  const [activeTab, setActiveTab] = useState<ForecastCat | 'all'>('all');
  const [timeMode, setTimeMode] = useState<'quarter' | 'month'>('quarter');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // F1: OppDrawer
  const [drawer, setDrawer] = useState<{ title: string; opps: any[] } | null>(null);
  // F2/F3: config modal
  const [configOpen, setConfigOpen] = useState(false);

  const period = periodKey(year, quarter);
  const [qStart, qEnd] = quarterRange(year, quarter);

  const isManager =
    user?.roles?.includes('admin') ||
    user?.roles?.includes('sales_manager') ||
    user?.roles?.some((r: any) => typeof r === 'object' && ['admin','sales_manager'].includes(r.role?.code));

  // ── F2/F3: load forecast config from DB ──
  const { data: forecastConfig, isLoading: configLoading } = useQuery({
    queryKey: ['forecast-config'],
    queryFn: () => forecastApi.getConfig(),
  });

  const configSaveMutation = useMutation({
    mutationFn: (cfg: any) => forecastApi.upsertConfig(cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forecast-config'] });
      setConfigOpen(false);
    },
  });

  // Dynamic stage→category mapping from DB (falls back to pipeline for unknowns)
  const stageCategories: Record<string, string> = forecastConfig?.categories ?? {};

  // ── Opportunities ──
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['opps-forecast', year, quarter],
    queryFn: () => oppsApi.list({ take: 500, closeDateFrom: qStart.toISOString(), closeDateTo: qEnd.toISOString() }),
  });

  // ── Targets ──
  const { data: myTarget } = useQuery({
    queryKey: ['forecast-target', period, user?.id],
    queryFn: () => forecastApi.getTarget(period, user?.id),
    enabled: !!user?.id,
  });

  const { data: teamTargets = [] } = useQuery({
    queryKey: ['forecast-targets-team', period],
    queryFn: () => forecastApi.teamTargets(period),
    enabled: view === 'team',
  });

  const { data: usersResp } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => adminApi.listUsers({ take: 50 }),
    enabled: view === 'team',
  });
  const allUsers: any[] = usersResp?.data ?? usersResp ?? [];

  const saveMutation = useMutation({
    mutationFn: ({ quota, userId }: { quota: number; userId: string }) =>
      forecastApi.upsertTarget(period, quota, userId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['forecast-target', period, vars.userId] });
      qc.invalidateQueries({ queryKey: ['forecast-targets-team', period] });
    },
  });

  const myQuota = myTarget?.quota ?? 0;
  const allOpps: any[] = data?.data ?? data ?? [];

  const opps = useMemo(() => {
    if (view === 'mine' && user?.id) return allOpps.filter((o) => o.ownerId === user.id);
    return allOpps;
  }, [allOpps, view, user]);

  const totals = useMemo(() => buildTotals(opps, stageCategories), [opps, stageCategories]);

  const stageBreakdown = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const o of allOpps) {
      const cat = stageCategories[o.stage] ?? 'pipeline';
      if (cat === 'omitted') continue;
      const s = o.stage as string;
      if (!map[s]) map[s] = { amount: 0, count: 0 };
      map[s].amount += toNum(o.amount);
      map[s].count  += 1;
    }
    return STAGE_ORDER.filter((s) => map[s] && s !== 'closed_lost').map((s) => ({
      stage: s, label: STAGE_LABEL[s] ?? s, prob: STAGE_PROB[s] ?? 0,
      cat: stageCategories[s] ?? 'pipeline', ...map[s],
    }));
  }, [allOpps, stageCategories]);

  const maxStageAmt = Math.max(...stageBreakdown.map((s) => s.amount), 1);

  const tableOpps = useMemo(() => {
    if (activeTab === 'all') return opps.filter((o) => (stageCategories[o.stage] ?? 'pipeline') !== 'omitted');
    return totals[activeTab as ForecastCat]?.opps ?? [];
  }, [opps, activeTab, totals, stageCategories]);

  const perUserStats = useMemo(() => {
    const map: Record<string, { won: number; pipeline: number; commit: number }> = {};
    for (const o of allOpps) {
      if (!map[o.ownerId]) map[o.ownerId] = { won: 0, pipeline: 0, commit: 0 };
      const amt = toNum(o.amount);
      const cat = stageCategories[o.stage] ?? 'pipeline';
      if (cat === 'closed') map[o.ownerId].won += amt;
      if (cat !== 'omitted') map[o.ownerId].pipeline += amt;
      if (['commit','closed'].includes(cat)) map[o.ownerId].commit += amt;
    }
    return map;
  }, [allOpps, stageCategories]);

  const quota = view === 'mine' ? myQuota : 0;
  const closedPct = quota > 0 ? Math.min((totals.closed.amount / quota) * 100, 100) : 0;
  const quarterLabel = `Q${quarter} ${year}`;

  function prevQ() { quarter === 1 ? (setYear((y) => y - 1), setQuarter(4)) : setQuarter((q) => q - 1); }
  function nextQ() { quarter === 4 ? (setYear((y) => y + 1), setQuarter(1)) : setQuarter((q) => q + 1); }

  const editingUser = editingUserId ? allUsers.find((u) => u.id === editingUserId) : null;
  const editingQuota = editingUserId ? (teamTargets.find((t: any) => t.userId === editingUserId)?.quota ?? 0) : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">

      {/* ── Modals & Drawers ── */}
      <QuotaModal
        open={!!editingUserId}
        userName={editingUser?.displayName ?? ''}
        current={editingQuota}
        saving={saveMutation.isPending}
        onClose={() => setEditingUserId(null)}
        onSave={(v) => { if (editingUserId) saveMutation.mutate({ quota: v, userId: editingUserId }); }}
      />

      {forecastConfig && (
        <ForecastConfigModal
          open={configOpen}
          config={forecastConfig}
          saving={configSaveMutation.isPending}
          onClose={() => setConfigOpen(false)}
          onSave={(cfg) => configSaveMutation.mutate(cfg as any)}
        />
      )}

      {drawer && (
        <OppDrawer
          title={drawer.title}
          opps={drawer.opps}
          onClose={() => setDrawer(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <BarChart2 size={13} />
            <span>销售预测</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">预测概览</h1>
          <p className="text-sm text-ink-secondary">按季度追踪配额完成情况与商机预测</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Mine / Team toggle */}
          <div className="flex items-center bg-surface-secondary rounded-xl p-1 gap-1 border border-border text-sm font-semibold">
            <button
              onClick={() => setView('mine')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all', view === 'mine' ? 'bg-white shadow-sm text-ink' : 'text-ink-secondary hover:text-ink')}
            >
              <User size={13} /> 我的预测
            </button>
            <button
              onClick={() => setView('team')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all', view === 'team' ? 'bg-white shadow-sm text-ink' : 'text-ink-secondary hover:text-ink')}
            >
              <Users size={13} /> 全团队
            </button>
          </div>

          {/* Time mode toggle (F1) */}
          <div className="flex items-center bg-surface-secondary rounded-xl p-1 gap-1 border border-border text-sm font-semibold">
            <button
              onClick={() => setTimeMode('quarter')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all', timeMode === 'quarter' ? 'bg-white shadow-sm text-ink' : 'text-ink-secondary hover:text-ink')}
            >
              <Calendar size={13} /> 季度
            </button>
            <button
              onClick={() => setTimeMode('month')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all', timeMode === 'month' ? 'bg-white shadow-sm text-ink' : 'text-ink-secondary hover:text-ink')}
            >
              <CalendarDays size={13} /> 月度
            </button>
          </div>

          {/* Quarter navigation */}
          <div className="flex items-center gap-1 bg-surface-secondary rounded-xl border border-border px-1 py-1">
            <button onClick={prevQ} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-ink-secondary transition-all"><ChevronLeft size={15} /></button>
            <span className="px-3 text-sm font-black text-ink min-w-[72px] text-center">{quarterLabel}</span>
            <button onClick={nextQ} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-ink-secondary transition-all"><ChevronRight size={15} /></button>
          </div>

          {/* Refresh */}
          <button onClick={() => refetch()} className="p-2 rounded-xl border border-border hover:bg-surface-secondary text-ink-secondary hover:text-brand transition-all" title="刷新">
            <RefreshCw size={15} />
          </button>

          {/* Config gear (F2/F3) */}
          <button
            onClick={() => setConfigOpen(true)}
            disabled={configLoading}
            className="p-2 rounded-xl border border-border hover:bg-surface-secondary text-ink-secondary hover:text-brand transition-all"
            title="预测设置"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {/* ── Team quota management table ── */}
      {view === 'team' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-brand" />
              <h3 className="font-bold text-ink text-sm">团队目标分配 · {quarterLabel}</h3>
            </div>
            {isManager && <p className="text-xs text-ink-muted">点击「设置目标」为成员分配季度配额</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>成员</th><th>季度目标</th><th>已赢单</th><th>已承诺</th><th>流水线</th><th>目标达成</th>
                  {isManager && <th></th>}
                </tr>
              </thead>
              <tbody>
                {allUsers.filter((u: any) => u.isActive !== false).map((u: any) => {
                  const tgt = teamTargets.find((t: any) => t.userId === u.id);
                  const q = toNum(tgt?.quota ?? 0);
                  const stats = perUserStats[u.id] ?? { won: 0, pipeline: 0, commit: 0 };
                  const pct = pctBar(stats.won, q);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center text-brand font-bold text-sm shrink-0">
                            {u.displayName?.[0] ?? '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-ink text-sm leading-tight">{u.displayName}</p>
                            <p className="text-xs text-ink-muted">{u.title ?? u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>{q > 0 ? <span className="font-bold text-ink">{fmtMoney(q)}</span> : <span className="text-ink-muted text-xs">未设置</span>}</td>
                      <td><span className="font-semibold text-success">{fmtMoney(stats.won)}</span></td>
                      <td><span className="text-ink-secondary">{fmtMoney(stats.commit)}</span></td>
                      <td><span className="text-ink-secondary">{fmtMoney(stats.pipeline)}</span></td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all duration-500', pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-brand' : pct >= 20 ? 'bg-warning' : 'bg-danger')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={cn('text-xs font-bold w-9 text-right', pct >= 80 ? 'text-success' : pct >= 50 ? 'text-brand' : 'text-ink-muted')}>
                            {q > 0 ? `${pct}%` : '—'}
                          </span>
                        </div>
                      </td>
                      {isManager && (
                        <td>
                          <button
                            onClick={() => setEditingUserId(u.id)}
                            className="flex items-center gap-1 text-xs font-bold text-ink-secondary hover:text-brand transition-colors px-2 py-1 rounded-lg hover:bg-brand/5"
                          >
                            <Settings2 size={12} /> 设置目标
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── My quota progress bar (mine view) ── */}
      {view === 'mine' && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-ink-secondary uppercase tracking-widest">我的配额完成进度 · {quarterLabel}</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-black text-success">{fmtMoney(totals.closed.amount)}</span>
                <span className="text-ink-muted text-sm font-semibold">/ 目标</span>
                <span className="text-2xl font-black text-ink-secondary">
                  {myQuota > 0 ? fmtMoney(myQuota) : <span className="text-sm text-ink-muted font-normal">未设置（由经理分配）</span>}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-ink">{myQuota > 0 ? `${closedPct.toFixed(1)}%` : '—'}</p>
              <p className="text-xs text-ink-muted mt-0.5">配额达成率</p>
            </div>
          </div>
          {myQuota > 0 && (
            <>
              <div className="relative h-3 bg-surface-tertiary rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${closedPct}%` }}
                />
                {totals.commit.amount > 0 && (
                  <div className="absolute top-0 h-full w-0.5 bg-brand/60" style={{ left: `${Math.min((totals.commit.amount / myQuota) * 100, 100)}%` }} />
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />已赢单</span>
                <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-brand/60" />已承诺线</span>
                <span className="ml-auto">剩余配额：{fmtMoney(Math.max(myQuota - totals.closed.amount, 0))}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── F1: Monthly stats table ── */}
      {timeMode === 'month' && (
        <MonthlyTable
          year={year}
          quarter={quarter}
          opps={opps}
          stageCategories={stageCategories}
          onCellClick={(title, cellOpps) => setDrawer({ title, opps: cellOpps })}
        />
      )}

      {/* ── 4 category cards (clickable → OppDrawer) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.entries(CAT_CONFIG) as [ForecastCat, typeof CAT_CONFIG[ForecastCat]][]).map(([key, cfg]) => {
          const t = totals[key];
          const icons: Record<ForecastCat, React.ReactNode> = {
            pipeline: <Layers size={20} />, best_case: <Star size={20} />,
            commit: <Target size={20} />, closed: <CheckCircle2 size={20} />,
          };
          return (
            <div
              key={key}
              onClick={() => {
                setActiveTab(key);
                if (t.count > 0) setDrawer({ title: `${cfg.label} · ${quarterLabel}`, opps: t.opps });
                else setDrawer(null);
              }}
              className={cn('card p-5 cursor-pointer transition-all hover:shadow-md', activeTab === key && `ring-2 ring-offset-1 ${cfg.border.replace('border-','ring-')}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn('p-2 rounded-xl', cfg.bg, cfg.text)}>{icons[key]}</div>
                <span className={cn('badge text-xs', cfg.bg, cfg.text)}>{t.count} 条</span>
              </div>
              <p className="text-xs font-bold text-ink-secondary uppercase tracking-wider mb-1">{cfg.label}</p>
              <p className="text-2xl font-black text-ink">{fmtMoney(t.amount)}</p>
              <p className="text-xs text-ink-muted mt-1">{cfg.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Stage funnel + opportunity table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Stage funnel */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={16} className="text-brand" />
            <h3 className="font-bold text-ink text-sm">阶段分布（全团队）</h3>
          </div>
          <div className="space-y-3">
            {stageBreakdown.length === 0
              ? <p className="text-sm text-ink-muted text-center py-8">暂无数据</p>
              : stageBreakdown.map((row) => {
                const barColors: Record<string, string> = { pipeline: 'bg-info', best_case: 'bg-warning', commit: 'bg-brand', closed: 'bg-success' };
                const pct = maxStageAmt > 0 ? (row.amount / maxStageAmt) * 100 : 0;
                return (
                  <div key={row.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{row.label}</span>
                      <div className="flex items-center gap-2 text-ink-muted">
                        <span>{row.count} 条</span>
                        <span className="font-bold text-ink">{fmtMoney(row.amount)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-500', barColors[row.cat] ?? 'bg-brand')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Opportunity table */}
        <div className="lg:col-span-3 card overflow-hidden">
          <div className="flex border-b border-border px-4 pt-1 gap-1 overflow-x-auto">
            {([['all','全部'],['pipeline','流水线'],['best_case','最佳预期'],['commit','已承诺'],['closed','已赢单']] as const).map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={cn('px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-all',
                  activeTab === key ? 'text-brand border-brand' : 'text-ink-secondary border-transparent hover:text-ink')}
              >
                {lbl}
                {key !== 'all' && (
                  <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', activeTab === key ? 'bg-brand/10 text-brand' : 'bg-surface-tertiary text-ink-muted')}>
                    {totals[key as ForecastCat]?.count ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>
          {isLoading
            ? <div className="p-12 text-center text-ink-muted text-sm">加载中…</div>
            : tableOpps.length === 0
            ? <div className="p-12 text-center text-ink-muted text-sm">{view === 'mine' ? '该季度暂无您负责的商机' : '暂无数据'}</div>
            : (
              <div className="overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>商机名称</th><th>负责人</th><th>阶段</th><th>预测类别</th><th>金额</th><th>关闭日期</th><th>胜率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableOpps.map((o) => {
                      const cat = (stageCategories[o.stage] ?? 'pipeline') as ForecastCat | 'omitted';
                      const catCfg = cat !== 'omitted' ? CAT_CONFIG[cat as ForecastCat] : null;
                      const prob = o.probability ?? STAGE_PROB[o.stage] ?? 0;
                      return (
                        <tr key={o.id}>
                          <td>
                            <Link href={`/opportunities/${o.id}`} className="font-semibold text-ink hover:text-brand transition-colors">{o.name}</Link>
                            {o.account?.name && <p className="text-xs text-ink-muted mt-0.5">{o.account.name}</p>}
                          </td>
                          <td><span className="text-xs text-ink-secondary">{o.owner?.displayName ?? '—'}</span></td>
                          <td><span className="text-xs text-ink-secondary">{STAGE_LABEL[o.stage] ?? o.stage}</span></td>
                          <td>
                            {catCfg
                              ? <span className={cn('badge text-xs', catCfg.bg, catCfg.text)}>{catCfg.label}</span>
                              : <span className="badge badge-gray text-xs">已丢单</span>}
                          </td>
                          <td>
                            <button
                              onClick={() => setDrawer({ title: `${o.name} 的商机`, opps: [o] })}
                              className="font-semibold text-ink hover:text-brand transition-colors"
                            >
                              {fmtMoney(toNum(o.amount))}
                            </button>
                          </td>
                          <td><span className="text-xs text-ink-secondary">{o.closeDate ? new Date(o.closeDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}</span></td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full', prob>=80?'bg-success':prob>=50?'bg-brand':prob>=20?'bg-warning':'bg-danger')} style={{ width: `${prob}%` }} />
                              </div>
                              <span className="text-xs text-ink-muted w-8">{prob}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>

      {/* ── Bottom stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '加权预测金额', value: opps.reduce((s,o)=>s+toNum(o.amount)*(STAGE_PROB[o.stage]??0)/100,0), sub: '基于胜率加权', color: 'text-purple' },
          { label: '平均商机金额', value: opps.length?opps.reduce((s,o)=>s+toNum(o.amount),0)/opps.length:0, sub: `共 ${opps.length} 条`, color: 'text-info' },
          { label: '本季商机数', value: allOpps.length, sub: '关闭日在本季', isCnt: true, color: 'text-brand' },
          { label: '赢单率', value: opps.length?Math.round(opps.filter(o=>o.stage==='closed_won').length/opps.length*100):0, sub: '本季商机', isPct: true, color: 'text-success' },
        ].map((item) => (
          <div key={item.label} className="card p-5">
            <p className="text-xs font-bold text-ink-secondary uppercase tracking-wider mb-2">{item.label}</p>
            <p className={cn('text-2xl font-black', item.color)}>
              {item.isCnt ? item.value : item.isPct ? `${item.value}%` : fmtMoney(item.value as number)}
            </p>
            <p className="text-xs text-ink-muted mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* ── F4: Update tasks panel ── */}
      {user?.id && (
        <div className="border-t border-border pt-8">
          <UpdateTasksPanel
            isManager={!!isManager}
            period={period}
            userId={user.id}
          />
        </div>
      )}

    </div>
  );
}
