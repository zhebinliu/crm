'use client';
import { useQuery } from '@tanstack/react-query';
import { oppsApi, leadsApi, activitiesApi, accountsApi, quotesApi } from '@/lib/api';
import { fmtMoney, fmtDate, stageColor, statusColor, cn } from '@/lib/utils';
import {
  TrendingUp, Users, CheckSquare, ArrowUpRight, Target, Activity,
  Sparkles, ChevronRight, BarChart3, FileText, ShoppingCart, ScrollText,
  UserPlus, Building2, Calendar, Bell, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { data: opps } = useQuery({ queryKey: ['opps-dashboard'], queryFn: () => oppsApi.list({ take: 50 }) });
  const { data: leads } = useQuery({ queryKey: ['leads-dashboard'], queryFn: () => leadsApi.list({ take: 50 }) });
  const { data: tasks } = useQuery({ queryKey: ['tasks-dashboard'], queryFn: () => activitiesApi.list({ status: 'OPEN', take: 10 }) });
  const { data: accounts } = useQuery({ queryKey: ['accounts-dashboard'], queryFn: () => accountsApi.list({ take: 50 }) });
  const { data: quotes } = useQuery({ queryKey: ['quotes-dashboard'], queryFn: () => quotesApi.list({ take: 50 }) });

  const totalPipeline = opps?.data?.reduce((s: number, o: any) => s + Number(o.amount ?? 0), 0) ?? 0;
  const wonAmount = opps?.data?.filter((o: any) => o.stage === 'closed_won').reduce((s: number, o: any) => s + Number(o.amount ?? 0), 0) ?? 0;
  const openOpps = opps?.data?.filter((o: any) => !o.isClosed).length ?? 0;
  const openLeads = leads?.total ?? 0;
  const openTasks = tasks?.total ?? 0;
  const totalAccounts = accounts?.total ?? 0;
  const draftQuotes = quotes?.data?.filter((q: any) => q.status === 'draft').length ?? 0;
  const overdueTasks = tasks?.data?.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date()).length ?? 0;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <Sparkles size={13} />
            <span>词元波动 · 智能销售工作台</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">
            销售概览
          </h1>
          <p className="text-sm text-slate-400 font-medium flex items-center gap-1.5">
            <Calendar size={13} />
            {fmtDate(new Date(), 'YYYY年MM月DD日')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leads">
            <Button variant="outline" className="rounded-xl border-slate-200 h-10 px-5 font-bold text-sm">
              <UserPlus size={15} className="mr-2" />新建线索
            </Button>
          </Link>
          <Link href="/opportunities">
            <Button className="rounded-xl bg-brand hover:bg-brand-deep text-white h-10 px-5 font-bold text-sm shadow-lg shadow-brand/20">
              <Target size={15} className="mr-2" />新建商机
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Grid — 4 primary + 4 secondary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          href="/opportunities"
          icon={<Target size={20} />}
          label="管道总金额" value={fmtMoney(totalPipeline)}
          sub={`${openOpps} 个进行中商机`} trend="+12.5%"
          color="indigo"
        />
        <KpiCard
          href="/opportunities"
          icon={<TrendingUp size={20} />}
          label="本季度赢单" value={fmtMoney(wonAmount)}
          sub="已完结订单累计" trend="+8.2%"
          color="emerald"
        />
        <KpiCard
          href="/leads"
          icon={<UserPlus size={20} />}
          label="待跟进线索" value={String(openLeads)}
          sub="未分配或跟进中" trend={openLeads > 0 ? '需处理' : '良好'}
          color="violet"
        />
        <KpiCard
          href="/activities"
          icon={<CheckSquare size={20} />}
          label="待办任务" value={String(openTasks)}
          sub={overdueTasks > 0 ? `${overdueTasks} 项已逾期` : '全部在期'}
          trend={overdueTasks > 0 ? `${overdueTasks} 逾期` : ''}
          color={overdueTasks > 0 ? 'red' : 'amber'}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SecondaryCard href="/accounts" icon={<Building2 size={16} />} label="客户总数" value={String(totalAccounts)} color="blue" />
        <SecondaryCard href="/quotes" icon={<FileText size={16} />} label="草稿报价单" value={String(draftQuotes)} color="orange" />
        <SecondaryCard href="/orders" icon={<ShoppingCart size={16} />} label="进行中订单" value={String(opps?.data?.length ?? 0)} color="teal" />
        <SecondaryCard href="/contracts" icon={<ScrollText size={16} />} label="激活合同" value="—" color="purple" />
      </div>

      {/* Main content: 3 column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Nav — full-width module tiles */}
        <div className="lg:col-span-2 space-y-5">
          {/* Module grid */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">快速导航</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { href: '/leads', icon: <UserPlus size={22} />, label: '线索', sub: `${openLeads} 待跟进`, color: 'violet' },
                { href: '/accounts', icon: <Building2 size={22} />, label: '客户', sub: `${totalAccounts} 个客户`, color: 'blue' },
                { href: '/contacts', icon: <Users size={22} />, label: '联系人', sub: '查看全部', color: 'teal' },
                { href: '/opportunities', icon: <Target size={22} />, label: '商机', sub: `${openOpps} 进行中`, color: 'indigo' },
                { href: '/quotes', icon: <FileText size={22} />, label: '报价单', sub: `${draftQuotes} 草稿`, color: 'orange' },
                { href: '/activities', icon: <CheckSquare size={22} />, label: '活动任务', sub: `${openTasks} 待办`, color: 'amber' },
              ].map((m) => (
                <Link key={m.href} href={m.href}>
                  <div className={cn(
                    'group p-5 rounded-2xl border border-slate-100 bg-white hover:border-transparent',
                    'hover:shadow-xl transition-all duration-200 cursor-pointer',
                  )}>
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all group-hover:scale-110', iconBg(m.color))}>
                      {m.icon}
                    </div>
                    <p className="font-bold text-ink text-sm">{m.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Year target progress */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-slate-900 text-white overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">年度业绩目标</p>
                  <p className="text-4xl font-black mt-1">84%</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs">距目标还差</p>
                  <p className="text-brand font-black text-xl mt-0.5">¥160万</p>
                </div>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="bg-brand h-full w-[84%] rounded-full shadow-[0_0_12px_rgba(255,141,26,0.6)] transition-all duration-1000" />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>¥0</span>
                <span className="text-slate-400">目标 ¥1000万</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Overdue / urgent tasks */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-5 border-b border-slate-50 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CheckSquare size={16} className="text-amber-500" />
                待办任务
              </CardTitle>
              {overdueTasks > 0 && (
                <span className="text-[10px] font-bold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">{overdueTasks} 逾期</span>
              )}
            </CardHeader>
            <CardContent className="p-5 pt-4 space-y-3">
              {(tasks?.data ?? []).slice(0, 5).map((t: any) => (
                <Link key={t.id} href="/activities">
                  <div className="group flex items-start gap-3 py-2 hover:bg-slate-50 rounded-xl px-2 -mx-2 transition-colors cursor-pointer">
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-1.5 shrink-0',
                      t.priority === 'high' ? 'bg-red-400' : t.priority === 'normal' ? 'bg-amber-400' : 'bg-slate-300'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate group-hover:text-brand transition-colors">{t.subject}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {t.dueDate ? fmtDate(t.dueDate) : '无截止日期'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
              {(tasks?.data?.length ?? 0) === 0 && (
                <p className="text-center text-slate-300 py-6 text-sm italic">暂无待办任务 🎉</p>
              )}
              <Link href="/activities">
                <Button variant="ghost" className="w-full mt-1 h-9 rounded-xl text-xs font-bold text-slate-400 hover:text-ink hover:bg-slate-50">
                  查看全部 <ChevronRight size={12} className="ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent leads */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-5 border-b border-slate-50 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Zap size={16} className="text-violet-500" />
                最新线索
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-4 space-y-3">
              {(leads?.data ?? []).slice(0, 4).map((l: any) => (
                <Link key={l.id} href={`/leads/${l.id}`}>
                  <div className="group flex items-center gap-3 py-1.5 hover:bg-slate-50 rounded-xl px-2 -mx-2 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-xs shrink-0">
                      {(l.firstName?.[0] ?? l.company?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate group-hover:text-brand transition-colors">
                        {l.firstName} {l.lastName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{l.company ?? '—'}</p>
                    </div>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', statusBadge(l.status))}>{statusZh(l.status)}</span>
                  </div>
                </Link>
              ))}
              {(leads?.data?.length ?? 0) === 0 && (
                <p className="text-center text-slate-300 py-6 text-sm italic">暂无线索</p>
              )}
              <Link href="/leads">
                <Button variant="ghost" className="w-full mt-1 h-9 rounded-xl text-xs font-bold text-slate-400 hover:text-ink hover:bg-slate-50">
                  查看全部线索 <ChevronRight size={12} className="ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ href, icon, label, value, sub, trend, color }: {
  href: string; icon: React.ReactNode; label: string; value: string;
  sub: string; trend?: string; color: string;
}) {
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-500',
  };
  return (
    <Link href={href}>
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2rem] group hover:shadow-2xl hover:shadow-brand/5 transition-all duration-300 cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className={cn('p-2.5 rounded-xl transition-transform group-hover:scale-110', bg[color] ?? bg.amber)}>
              {icon}
            </div>
            {trend && (
              <div className={cn(
                'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black',
                trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' :
                trend === '逾期' || trend.includes('逾期') ? 'bg-red-50 text-red-500' :
                'bg-slate-100 text-slate-500'
              )}>
                {trend.startsWith('+') && <ArrowUpRight size={9} />}
                {trend}
              </div>
            )}
          </div>
          <p className="text-2xl font-black text-ink tracking-tight">{value}</p>
          <p className="text-xs font-bold text-ink/60 uppercase tracking-wide mt-1">{label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function SecondaryCard({ href, icon, label, value, color }: {
  href: string; icon: React.ReactNode; label: string; value: string; color: string;
}) {
  const map: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', orange: 'bg-orange-50 text-orange-600',
    teal: 'bg-teal-50 text-teal-600', purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', map[color] ?? map.blue)}>
          {icon}
        </div>
        <div>
          <p className="text-lg font-black text-ink leading-none">{value}</p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">{label}</p>
        </div>
      </div>
    </Link>
  );
}

function iconBg(color: string): string {
  const map: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600',
    teal: 'bg-teal-50 text-teal-600', indigo: 'bg-indigo-50 text-indigo-600',
    orange: 'bg-orange-50 text-orange-600', amber: 'bg-amber-50 text-amber-600',
  };
  return map[color] ?? 'bg-slate-50 text-slate-600';
}

function statusBadge(s: string): string {
  const m: Record<string, string> = {
    new: 'bg-blue-50 text-blue-600', working: 'bg-amber-50 text-amber-600',
    qualified: 'bg-emerald-50 text-emerald-700', unqualified: 'bg-red-50 text-red-500',
    nurturing: 'bg-violet-50 text-violet-600',
  };
  return m[s] ?? 'bg-slate-100 text-slate-500';
}

function statusZh(s: string): string {
  const m: Record<string, string> = {
    new: '新线索', working: '跟进中', qualified: '已资质', unqualified: '未资质', nurturing: '培育中',
  };
  return m[s] ?? s;
}
