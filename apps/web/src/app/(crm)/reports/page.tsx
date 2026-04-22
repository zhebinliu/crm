'use client';

import { useQuery } from '@tanstack/react-query';
import {
  leadsApi, accountsApi, oppsApi, activitiesApi,
} from '@/lib/api';
import { fmtMoney, cn } from '@/lib/utils';
import {
  BarChart3, TrendingUp, Target, Users, Building2,
  Download, CheckSquare, AlertCircle, Calendar,
  Flame, Thermometer, Snowflake, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

// ── helpers ──────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function getQuarterBounds() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
  return { start, end };
}

function isThisQuarter(d: string | null | undefined) {
  if (!d) return false;
  const { start, end } = getQuarterBounds();
  const dt = new Date(d);
  return dt >= start && dt <= end;
}

function ym(d: string | null | undefined) {
  if (!d) return '';
  return d.slice(0, 7);
}

function last6Months(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function isThisWeek(d: string | null | undefined) {
  if (!d) return false;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const dt = new Date(d);
  return dt >= monday && dt <= sunday;
}

function dayLabel(d: string) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[new Date(d).getDay()];
}

// ── Stage metadata ────────────────────────────────────────────────────────────

const STAGE_META: Record<string, { label: string; color: string }> = {
  prospecting:       { label: '初步接触', color: 'bg-slate-400' },
  qualification:     { label: '资质验证', color: 'bg-blue-400' },
  needs_analysis:    { label: '需求分析', color: 'bg-indigo-400' },
  value_proposition: { label: '价值主张', color: 'bg-violet-400' },
  proposal:          { label: '方案提案', color: 'bg-amber-400' },
  negotiation:       { label: '谈判议价', color: 'bg-orange-400' },
  closed_won:        { label: '赢单', color: 'bg-emerald-500' },
  closed_lost:       { label: '败单', color: 'bg-red-400' },
};

const ACTIVITY_META: Record<string, { label: string; color: string }> = {
  CALL:    { label: '电话', color: 'bg-blue-400' },
  EMAIL:   { label: '邮件', color: 'bg-violet-400' },
  MEETING: { label: '会议', color: 'bg-amber-400' },
  TASK:    { label: '任务', color: 'bg-emerald-400' },
  NOTE:    { label: '备注', color: 'bg-slate-400' },
};

const LEAD_STATUS_META: Record<string, { label: string; color: string }> = {
  new:         { label: '新线索', color: 'bg-blue-400' },
  working:     { label: '跟进中', color: 'bg-amber-400' },
  qualified:   { label: '已资质', color: 'bg-emerald-500' },
  unqualified: { label: '未资质', color: 'bg-red-400' },
  nurturing:   { label: '培育中', color: 'bg-violet-400' },
};

// ── Shared UI components ─────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <Card className="p-6 rounded-3xl bg-white border-none shadow-xl shadow-slate-200/40">
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', accent)}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black text-ink mt-4 leading-none">{value}</p>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

function HBar({ label, count, maxCount, amount, color, pct }: {
  label: string; count: number; maxCount: number;
  amount?: number; color: string; pct?: number;
}) {
  const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-slate-400 font-medium">
          {count} 条{amount !== undefined ? `  ${fmtMoney(amount)}` : ''}
          {pct !== undefined ? `  ${pct.toFixed(1)}%` : ''}
        </span>
      </div>
      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: oppsRes } = useQuery({
    queryKey: ['reports-opps'],
    queryFn: () => oppsApi.list({ take: 500 }),
  });
  const { data: leadsRes } = useQuery({
    queryKey: ['reports-leads'],
    queryFn: () => leadsApi.list({ take: 500 }),
  });
  const { data: accountsRes } = useQuery({
    queryKey: ['reports-accounts'],
    queryFn: () => accountsApi.list({ take: 500 }),
  });
  const { data: activitiesRes } = useQuery({
    queryKey: ['reports-activities'],
    queryFn: () => activitiesApi.list({ take: 500 }),
  });

  const opps: any[] = oppsRes?.data ?? [];
  const leads: any[] = leadsRes?.data ?? [];
  const accounts: any[] = accountsRes?.data ?? [];
  const activities: any[] = activitiesRes?.data ?? [];

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <BarChart3 size={13} />
            <span>词元波动 · 数据洞察</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">报表与分析</h1>
          <p className="text-sm text-slate-400 font-medium">实时数据，驱动销售决策</p>
        </div>
        <Button
          disabled
          className="rounded-xl bg-brand/10 text-brand border-none h-10 px-5 font-bold text-sm cursor-not-allowed opacity-60"
        >
          <Download size={15} className="mr-2" />
          导出报表
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-slate-100 rounded-2xl p-1 h-auto gap-1">
          <TabsTrigger value="overview" className="rounded-xl px-5 py-2.5 font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm transition-all">
            销售概览
          </TabsTrigger>
          <TabsTrigger value="leads" className="rounded-xl px-5 py-2.5 font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm transition-all">
            线索分析
          </TabsTrigger>
          <TabsTrigger value="activities" className="rounded-xl px-5 py-2.5 font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm transition-all">
            活动报告
          </TabsTrigger>
          <TabsTrigger value="accounts" className="rounded-xl px-5 py-2.5 font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-sm transition-all">
            客户洞察
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Sales Overview ──────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-8 mt-0">
          <SalesOverviewTab opps={opps} />
        </TabsContent>

        {/* ── Tab 2: Lead Analysis ──────────────────────────────────────── */}
        <TabsContent value="leads" className="space-y-8 mt-0">
          <LeadAnalysisTab leads={leads} />
        </TabsContent>

        {/* ── Tab 3: Activity Report ────────────────────────────────────── */}
        <TabsContent value="activities" className="space-y-8 mt-0">
          <ActivityReportTab activities={activities} />
        </TabsContent>

        {/* ── Tab 4: Account Insights ───────────────────────────────────── */}
        <TabsContent value="accounts" className="space-y-8 mt-0">
          <AccountInsightsTab accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab 1: Sales Overview ────────────────────────────────────────────────────

function SalesOverviewTab({ opps }: { opps: any[] }) {
  const openOpps = opps.filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost');
  const wonOpps = opps.filter((o) => o.stage === 'closed_won');
  const lostOpps = opps.filter((o) => o.stage === 'closed_lost');
  const wonThisQ = wonOpps.filter((o) => isThisQuarter(o.closedDate ?? o.updatedAt));

  const pipeline = openOpps.reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const wonQTotal = wonThisQ.reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const winRate = wonOpps.length + lostOpps.length > 0
    ? (wonOpps.length / (wonOpps.length + lostOpps.length)) * 100
    : 0;
  const avgDeal = wonOpps.length > 0
    ? wonOpps.reduce((s, o) => s + Number(o.amount ?? 0), 0) / wonOpps.length
    : 0;

  // Pipeline by stage (open only)
  const byStage = groupBy(openOpps, (o) => o.stage ?? 'prospecting');
  const stageEntries = Object.entries(byStage).sort((a, b) => b[1].length - a[1].length);
  const maxStageCount = stageEntries.length > 0 ? stageEntries[0][1].length : 1;

  // Monthly trend
  const months = last6Months();
  const monthlyData = months.map((m) => {
    const created = opps.filter((o) => ym(o.createdAt) === m);
    const won = opps.filter((o) => o.stage === 'closed_won' && (ym(o.closedDate) === m || ym(o.updatedAt) === m));
    const wonAmt = won.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const eligible = opps.filter(
      (o) => (o.stage === 'closed_won' || o.stage === 'closed_lost') &&
        (ym(o.closedDate) === m || ym(o.updatedAt) === m),
    );
    const wr = eligible.length > 0 ? (won.length / eligible.length) * 100 : 0;
    return { month: m, created: created.length, wonAmt, winRate: wr };
  });

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        <StatCard
          label="管道总金额"
          value={fmtMoney(pipeline)}
          sub={`${openOpps.length} 个进行中商机`}
          icon={<Target size={18} className="text-indigo-600" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="本季赢单"
          value={fmtMoney(wonQTotal)}
          sub={`${wonThisQ.length} 笔成交`}
          icon={<TrendingUp size={18} className="text-emerald-600" />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="赢单率"
          value={`${winRate.toFixed(1)}%`}
          sub={`赢 ${wonOpps.length} / 败 ${lostOpps.length}`}
          icon={<BarChart3 size={18} className="text-brand" />}
          accent="bg-brand/10 text-brand"
        />
        <StatCard
          label="平均成交金额"
          value={avgDeal > 0 ? fmtMoney(avgDeal) : '—'}
          sub={`基于 ${wonOpps.length} 笔赢单`}
          icon={<Target size={18} className="text-violet-600" />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="平均销售周期"
          value="N/A"
          sub="暂无数据"
          icon={<Calendar size={18} className="text-slate-500" />}
          accent="bg-slate-100 text-slate-500"
        />
      </div>

      {/* Pipeline by stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="text-base font-bold">
              <SectionHeader
                title="各阶段商机分布"
                sub="进行中商机按销售阶段汇总"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {stageEntries.length === 0 && (
              <p className="text-sm text-slate-300 text-center py-8 italic">暂无进行中商机</p>
            )}
            {stageEntries.map(([stage, items]) => {
              const meta = STAGE_META[stage] ?? { label: stage, color: 'bg-slate-400' };
              const amt = items.reduce((s, o) => s + Number(o.amount ?? 0), 0);
              return (
                <HBar
                  key={stage}
                  label={meta.label}
                  count={items.length}
                  maxCount={maxStageCount}
                  amount={amt}
                  color={meta.color}
                />
              );
            })}
          </CardContent>
        </Card>

        {/* Monthly trend table */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="text-base font-bold">
              <SectionHeader title="月度趋势" sub="近 6 个月销售数据" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-3 text-left">月份</th>
                  <th className="pb-3 text-right">新商机数</th>
                  <th className="pb-3 text-right">赢单金额</th>
                  <th className="pb-3 text-right">赢单率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthlyData.map((row) => (
                  <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-semibold text-ink">{row.month}</td>
                    <td className="py-3 text-right text-slate-500">{row.created}</td>
                    <td className="py-3 text-right font-bold text-ink">
                      {row.wonAmt > 0 ? fmtMoney(row.wonAmt) : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        row.winRate >= 50 ? 'bg-emerald-50 text-emerald-600' :
                        row.winRate > 0 ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-100 text-slate-400',
                      )}>
                        {row.winRate > 0 ? `${row.winRate.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab 2: Lead Analysis ─────────────────────────────────────────────────────

function LeadAnalysisTab({ leads }: { leads: any[] }) {
  // Status distribution
  const byStatus = groupBy(leads, (l) => l.status ?? 'new');
  const statusEntries = Object.entries(LEAD_STATUS_META).map(([key, meta]) => ({
    key,
    meta,
    items: byStatus[key] ?? [],
  }));
  const maxStatusCount = Math.max(...statusEntries.map((e) => e.items.length), 1);

  // Source analysis
  const bySource = groupBy(leads, (l) => l.source ?? '未知');
  const sourceEntries = Object.entries(bySource)
    .map(([source, items]) => ({
      source,
      total: items.length,
      converted: items.filter((l) => l.isConverted).length,
    }))
    .sort((a, b) => b.total - a.total);

  // Rating distribution
  const ratingMeta: Record<string, { label: string; icon: React.ReactNode; color: string; badge: string }> = {
    hot:  { label: '热线索', icon: <Flame size={14} />, color: 'text-red-500', badge: 'bg-red-50 text-red-500' },
    warm: { label: '温线索', icon: <Thermometer size={14} />, color: 'text-amber-500', badge: 'bg-amber-50 text-amber-600' },
    cold: { label: '冷线索', icon: <Snowflake size={14} />, color: 'text-blue-500', badge: 'bg-blue-50 text-blue-600' },
  };
  const byRating = groupBy(leads, (l) => l.rating ?? 'cold');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="线索状态分布" sub={`共 ${leads.length} 条线索`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {statusEntries.map(({ key, meta, items }) => (
              <HBar
                key={key}
                label={meta.label}
                count={items.length}
                maxCount={maxStatusCount}
                color={meta.color}
                pct={leads.length > 0 ? (items.length / leads.length) * 100 : 0}
              />
            ))}
            {leads.length === 0 && (
              <p className="text-sm text-slate-300 text-center py-8 italic">暂无线索数据</p>
            )}
          </CardContent>
        </Card>

        {/* Rating distribution */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="线索评级分布" sub="按热度分类" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(ratingMeta).map(([key, m]) => {
                const cnt = (byRating[key] ?? []).length;
                const pct = leads.length > 0 ? ((cnt / leads.length) * 100).toFixed(1) : '0';
                return (
                  <div key={key} className="rounded-2xl bg-slate-50 p-5 text-center space-y-2">
                    <div className={cn('flex justify-center', m.color)}>{m.icon}</div>
                    <p className="text-3xl font-black text-ink">{cnt}</p>
                    <p className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full inline-block', m.badge)}>
                      {m.label}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">{pct}%</p>
                  </div>
                );
              })}
            </div>
            <Separator className="my-5" />
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">转化概览</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">已转化线索</span>
                <span className="font-bold text-ink">
                  {leads.filter((l) => l.isConverted).length}
                  <span className="text-slate-400 font-normal text-xs ml-1">
                    / {leads.length}
                  </span>
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 bg-emerald-500"
                  style={{ width: leads.length > 0 ? `${(leads.filter((l) => l.isConverted).length / leads.length) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source analysis */}
      <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
        <CardHeader className="p-6 pb-0">
          <CardTitle>
            <SectionHeader title="来源渠道分析" sub="按线索来源统计转化效率" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2 overflow-x-auto">
          {sourceEntries.length === 0 ? (
            <p className="text-sm text-slate-300 text-center py-8 italic">暂无数据</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-3 text-left">来源</th>
                  <th className="pb-3 text-right">数量</th>
                  <th className="pb-3 text-right">转化数</th>
                  <th className="pb-3 text-right">转化率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sourceEntries.map((row) => {
                  const rate = row.total > 0 ? (row.converted / row.total) * 100 : 0;
                  return (
                    <tr key={row.source} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 font-semibold text-ink">{row.source}</td>
                      <td className="py-3 text-right text-slate-500">{row.total}</td>
                      <td className="py-3 text-right text-slate-500">{row.converted}</td>
                      <td className="py-3 text-right">
                        <span className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          rate >= 30 ? 'bg-emerald-50 text-emerald-600' :
                          rate > 0 ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-400',
                        )}>
                          {rate > 0 ? `${rate.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 3: Activity Report ───────────────────────────────────────────────────

function ActivityReportTab({ activities }: { activities: any[] }) {
  const byType = groupBy(activities, (a) => a.type ?? 'NOTE');
  const typeEntries = Object.entries(ACTIVITY_META).map(([key, meta]) => ({
    key,
    meta,
    count: (byType[key] ?? []).length,
  }));
  const maxTypeCount = Math.max(...typeEntries.map((e) => e.count), 1);

  const completed = activities.filter((a) => a.status === 'COMPLETED').length;
  const total = activities.length;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  // This week
  const thisWeek = activities.filter((a) => isThisWeek(a.dueDate ?? a.createdAt));
  const byDay = groupBy(thisWeek, (a) => (a.dueDate ?? a.createdAt ?? '').slice(0, 10));
  const dayEntries = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 7);

  // Overdue
  const now = new Date();
  const overdue = activities.filter(
    (a) => a.status === 'OPEN' && a.dueDate && new Date(a.dueDate) < now,
  );

  return (
    <div className="space-y-6">
      {/* Top row: type breakdown + completion rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity type breakdown */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="活动类型分布" sub={`共 ${total} 条活动记录`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {typeEntries.map(({ key, meta, count }) => (
              <HBar
                key={key}
                label={meta.label}
                count={count}
                maxCount={maxTypeCount}
                color={meta.color}
                pct={total > 0 ? (count / total) * 100 : 0}
              />
            ))}
          </CardContent>
        </Card>

        {/* Completion rate + overdue */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="完成率概览" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-6">
            {/* Big pct */}
            <div className="flex items-end gap-4">
              <p className="text-6xl font-black text-ink leading-none">
                {completionRate.toFixed(0)}
                <span className="text-2xl text-slate-400">%</span>
              </p>
              <div className="pb-1 space-y-0.5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">任务完成率</p>
                <p className="text-xs text-slate-400">{completed} / {total} 已完成</p>
              </div>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-emerald-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <Separator />

            {/* Overdue callout */}
            <div className={cn(
              'flex items-center gap-4 p-4 rounded-2xl',
              overdue.length > 0 ? 'bg-red-50' : 'bg-emerald-50',
            )}>
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                overdue.length > 0 ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-600',
              )}>
                {overdue.length > 0 ? <AlertCircle size={18} /> : <CheckSquare size={18} />}
              </div>
              <div>
                <p className={cn(
                  'text-2xl font-black leading-none',
                  overdue.length > 0 ? 'text-red-600' : 'text-emerald-600',
                )}>
                  {overdue.length}
                </p>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  {overdue.length > 0 ? '项任务已逾期（状态仍为待处理）' : '项逾期任务，一切正常'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* This week */}
      <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
        <CardHeader className="p-6 pb-0">
          <CardTitle>
            <SectionHeader title="本周活动日历" sub="按截止日期或创建日期分组" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          {dayEntries.length === 0 ? (
            <p className="text-sm text-slate-300 text-center py-8 italic">本周暂无活动记录</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dayEntries.map(([day, items]) => (
                <div key={day} className="rounded-2xl bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">{dayLabel(day)}</span>
                    <span className="text-xs text-slate-400">{day.slice(5)}</span>
                  </div>
                  <p className="text-2xl font-black text-ink">{items.length}</p>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((a: any) => (
                      <p key={a.id} className="text-xs text-slate-500 truncate">
                        <span className={cn(
                          'inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle',
                          ACTIVITY_META[a.type]?.color ?? 'bg-slate-400',
                        )} />
                        {a.subject ?? a.type}
                      </p>
                    ))}
                    {items.length > 3 && (
                      <p className="text-xs text-slate-400">+{items.length - 3} 更多</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 4: Account Insights ──────────────────────────────────────────────────

function AccountInsightsTab({ accounts }: { accounts: any[] }) {
  // Industry breakdown
  const byIndustry = groupBy(accounts, (a) => a.industry ?? '未分类');
  const industryEntries = Object.entries(byIndustry)
    .map(([ind, items]) => ({ industry: ind, count: items.length }))
    .sort((a, b) => b.count - a.count);
  const maxIndustryCount = industryEntries.length > 0 ? industryEntries[0].count : 1;

  const INDUSTRY_COLORS = [
    'bg-blue-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400',
    'bg-orange-400', 'bg-indigo-400', 'bg-teal-400', 'bg-rose-400',
  ];

  // Top 10 by annual revenue
  const top10 = [...accounts]
    .filter((a) => a.annualRevenue != null)
    .sort((a, b) => Number(b.annualRevenue) - Number(a.annualRevenue))
    .slice(0, 10);

  // Growth: this month vs last month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const thisMonthCount = accounts.filter((a) => ym(a.createdAt) === thisMonth).length;
  const lastMonthCount = accounts.filter((a) => ym(a.createdAt) === lastMonth).length;
  const growthDelta = thisMonthCount - lastMonthCount;

  return (
    <div className="space-y-6">
      {/* Growth stat + industry breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="客户增长" sub="本月 vs 上月" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            <div className="flex items-end gap-3">
              <p className="text-5xl font-black text-ink leading-none">{thisMonthCount}</p>
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold mb-1',
                growthDelta > 0 ? 'bg-emerald-50 text-emerald-600' :
                growthDelta < 0 ? 'bg-red-50 text-red-500' :
                'bg-slate-100 text-slate-400',
              )}>
                {growthDelta > 0 ? <ArrowUp size={12} /> : growthDelta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                {Math.abs(growthDelta)}
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">本月新增客户</p>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">上月新增</span>
              <span className="font-bold text-ink">{lastMonthCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">客户总数</span>
              <span className="font-bold text-ink">{accounts.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Industry breakdown */}
        <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white lg:col-span-2">
          <CardHeader className="p-6 pb-0">
            <CardTitle>
              <SectionHeader title="行业分布" sub="按所属行业统计客户数量" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {industryEntries.length === 0 && (
              <p className="text-sm text-slate-300 text-center py-8 italic">暂无客户数据</p>
            )}
            {industryEntries.map(({ industry, count }, idx) => (
              <HBar
                key={industry}
                label={industry}
                count={count}
                maxCount={maxIndustryCount}
                color={INDUSTRY_COLORS[idx % INDUSTRY_COLORS.length]}
                pct={accounts.length > 0 ? (count / accounts.length) * 100 : 0}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 by revenue */}
      <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/40 bg-white">
        <CardHeader className="p-6 pb-0">
          <CardTitle>
            <SectionHeader title="按年收入 Top 10 客户" sub="以 annualRevenue 字段排序" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2 overflow-x-auto">
          {top10.length === 0 ? (
            <p className="text-sm text-slate-300 text-center py-8 italic">暂无收入数据</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-3 text-left w-8">#</th>
                  <th className="pb-3 text-left">客户名称</th>
                  <th className="pb-3 text-left">行业</th>
                  <th className="pb-3 text-right">年收入</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {top10.map((acc, i) => (
                  <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3">
                      <span className={cn(
                        'text-xs font-black w-6 h-6 rounded-lg flex items-center justify-center',
                        i === 0 ? 'bg-brand/10 text-brand' :
                        i === 1 ? 'bg-slate-200 text-slate-600' :
                        i === 2 ? 'bg-amber-100 text-amber-700' :
                        'text-slate-400',
                      )}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-ink">{acc.name}</td>
                    <td className="py-3 text-slate-400 text-xs">{acc.industry ?? '—'}</td>
                    <td className="py-3 text-right font-bold text-ink">{fmtMoney(acc.annualRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
