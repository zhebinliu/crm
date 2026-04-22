'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

import { activitiesApi } from '@/lib/api';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';

const ACTIVITY_EXTRA_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索主题', type: 'text' },
];

import {
  CheckSquare,
  Clock,
  Phone,
  Mail,
  Users,
  CalendarDays,
  Plus,
  Filter,
  FileText,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'NOTE';
type ActivityStatus = 'OPEN' | 'COMPLETED';
type ActivityPriority = 'low' | 'normal' | 'high';
type RelatedToType = 'lead' | 'account' | 'contact' | 'opportunity';

interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  description?: string;
  status: ActivityStatus;
  priority: ActivityPriority;
  dueDate?: string;
  targetType?: RelatedToType;
  targetId?: string;
  ownerId?: string;
  completedAt?: string;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ActivityType, string> = {
  CALL: '电话',
  EMAIL: '邮件',
  MEETING: '会议',
  TASK: '任务',
  NOTE: '备注',
};

const PRIORITY_LABELS: Record<ActivityPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
};

const STATUS_LABELS: Record<ActivityStatus, string> = {
  OPEN: '待处理',
  COMPLETED: '已完成',
};

const RELATED_TO_LABELS: Record<RelatedToType, string> = {
  lead: '线索',
  account: '客户',
  contact: '联系人',
  opportunity: '商机',
};

// ── Icon config ───────────────────────────────────────────────────────────────

interface TypeIconConfig {
  icon: React.ReactNode;
  bg: string;
  text: string;
}

function getTypeIconConfig(type: ActivityType): TypeIconConfig {
  switch (type) {
    case 'CALL':
      return { icon: <Phone size={18} />, bg: 'bg-blue-50', text: 'text-blue-500' };
    case 'EMAIL':
      return { icon: <Mail size={18} />, bg: 'bg-purple-50', text: 'text-purple-500' };
    case 'MEETING':
      return { icon: <Users size={18} />, bg: 'bg-green-50', text: 'text-green-500' };
    case 'TASK':
      return { icon: <CheckSquare size={18} />, bg: 'bg-amber-50', text: 'text-amber-500' };
    case 'NOTE':
      return { icon: <FileText size={18} />, bg: 'bg-slate-100', text: 'text-slate-400' };
  }
}

function getPriorityBadgeClass(priority: ActivityPriority): string {
  switch (priority) {
    case 'high':   return 'bg-red-50 text-red-600 border-red-100';
    case 'normal': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'low':    return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card className="p-5 rounded-2xl bg-white border-none shadow-lg shadow-slate-200/30">
      <CardContent className="p-0 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5">{label}</p>
          <p className="text-3xl font-black text-ink tracking-tight">{value}</p>
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', accent)}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({
  activity,
  onComplete,
  completing,
}: {
  activity: Activity;
  onComplete: (id: string) => void;
  completing: boolean;
}) {
  const cfg = getTypeIconConfig(activity.type);
  const isOverdue =
    activity.status === 'OPEN' &&
    activity.dueDate &&
    dayjs(activity.dueDate).isBefore(dayjs(), 'day');

  return (
    <div className="group flex items-start gap-4 p-5 rounded-2xl hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-100">
      {/* Type icon */}
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm', cfg.bg, cfg.text)}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('font-bold text-ink text-sm leading-snug truncate', activity.status === 'COMPLETED' && 'line-through text-slate-400')}>
          {activity.subject}
        </p>
        {activity.targetType && activity.targetId && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {RELATED_TO_LABELS[activity.targetType as RelatedToType] ?? activity.targetType} · {activity.targetId}
          </p>
        )}
        {activity.dueDate && (
          <div className={cn('flex items-center gap-1 mt-1.5 text-xs font-medium', isOverdue ? 'text-red-500' : 'text-slate-400')}>
            <Clock size={12} />
            <span>{fmtDate(activity.dueDate)}</span>
            {isOverdue && <span className="text-red-400">（已逾期）</span>}
          </div>
        )}
        {activity.description && (
          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{activity.description}</p>
        )}
      </div>

      {/* Right: badges + action */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Badge
            variant="outline"
            className={cn('text-[11px] font-semibold rounded-lg px-2 py-0.5 border', getPriorityBadgeClass(activity.priority))}
          >
            {PRIORITY_LABELS[activity.priority]}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'text-[11px] font-semibold rounded-lg px-2 py-0.5 border',
              activity.status === 'COMPLETED'
                ? 'bg-green-50 text-green-600 border-green-100'
                : 'bg-amber-50 text-amber-600 border-amber-100'
            )}
          >
            {STATUS_LABELS[activity.status]}
          </Badge>
        </div>
        {activity.status === 'OPEN' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={completing}
            onClick={() => onComplete(activity.id)}
            className="h-7 text-xs px-3 rounded-lg text-[#FF8D1A] hover:bg-orange-50 hover:text-[#FF8D1A] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
          >
            完成
          </Button>
        )}
        {activity.status === 'COMPLETED' && activity.completedAt && (
          <span className="text-[11px] text-slate-300">{fmtRelative(activity.completedAt)}</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 mt-2">
      {label}
    </h3>
  );
}

// ── New Activity Form ─────────────────────────────────────────────────────────

interface NewActivityForm {
  type: ActivityType;
  subject: string;
  description: string;
  priority: ActivityPriority;
  dueDate: string;
  relatedToType: RelatedToType | '';
  relatedToId: string;
}

const EMPTY_FORM: NewActivityForm = {
  type: 'TASK',
  subject: '',
  description: '',
  priority: 'normal',
  dueDate: '',
  relatedToType: '',
  relatedToId: '',
};

function NewActivityDialog({
  open,
  onClose,
  onCreate,
  creating,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<NewActivityForm>) => void;
  creating: boolean;
}) {
  const [form, setForm] = useState<NewActivityForm>(EMPTY_FORM);

  function handleChange(field: keyof NewActivityForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) return;
    const payload: Partial<NewActivityForm> = {
      type: form.type,
      subject: form.subject.trim(),
      priority: form.priority,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.dueDate) payload.dueDate = form.dueDate;
    if (form.relatedToType) {
      (payload as any).targetType = form.relatedToType;
      if (form.relatedToId.trim()) (payload as any).targetId = form.relatedToId.trim();
    }
    onCreate(payload);
  }

  function handleOpenChange(val: boolean) {
    if (!val) {
      setForm(EMPTY_FORM);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-ink">新建活动</DialogTitle>
        </DialogHeader>
        <Separator />
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">类型</Label>
              <Select value={form.type} onValueChange={(v) => handleChange('type', v as ActivityType)}>
                <SelectTrigger className="rounded-xl h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as ActivityType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">优先级</Label>
              <Select value={form.priority} onValueChange={(v) => handleChange('priority', v as ActivityPriority)}>
                <SelectTrigger className="rounded-xl h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as ActivityPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              主题 <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              value={form.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              placeholder="活动主题..."
              className="rounded-xl h-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">描述</Label>
            <Input
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="备注或描述..."
              className="rounded-xl h-10"
            />
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">截止日期</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => handleChange('dueDate', e.target.value)}
              className="rounded-xl h-10"
            />
          </div>

          {/* Related To */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">关联对象</Label>
              <Select
                value={form.relatedToType}
                onValueChange={(v) => handleChange('relatedToType', v as RelatedToType | '')}
              >
                <SelectTrigger className="rounded-xl h-10">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">无</SelectItem>
                  {(Object.keys(RELATED_TO_LABELS) as RelatedToType[]).map((r) => (
                    <SelectItem key={r} value={r}>{RELATED_TO_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">关联 ID</Label>
              <Input
                value={form.relatedToId}
                onChange={(e) => handleChange('relatedToId', e.target.value)}
                placeholder="记录 ID"
                disabled={!form.relatedToType}
                className="rounded-xl h-10"
              />
            </div>
          </div>

          <Separator />
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-10 px-5 font-bold">
              取消
            </Button>
            <Button
              type="submit"
              disabled={!form.subject.trim() || creating}
              className="rounded-xl h-10 px-5 font-bold bg-[#FF8D1A] hover:bg-[#e07d15] text-white shadow-lg shadow-orange-200/40"
            >
              {creating ? '创建中...' : '创建活动'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'OPEN' | 'COMPLETED';
type TypeFilter = 'ALL' | ActivityType;

export default function ActivitiesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [extraFilters, setExtraFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['activities', statusFilter, typeFilter, extraFilters],
    queryFn: () =>
      activitiesApi.list({
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(typeFilter !== 'ALL' && { type: typeFilter }),
        ...(extraFilters.search?.trim() && { search: extraFilters.search.trim() }),
        take: 200,
      }),
  });

  const activities: Activity[] = data?.data ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: (id: string) => activitiesApi.complete(id),
    onMutate: (id) => setCompletingId(id),
    onSettled: () => {
      setCompletingId(null);
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: unknown) => activitiesApi.create(d),
    onSuccess: () => {
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // For stats, always use full unfiltered list if available; fall back to current data
    const all: Activity[] = activities;
    const today = dayjs().startOf('day');
    const weekStart = dayjs().startOf('week');
    const weekEnd = dayjs().endOf('week');

    return {
      openCount: all.filter((a) => a.status === 'OPEN').length,
      todayCount: all.filter(
        (a) => a.dueDate && dayjs(a.dueDate).isSame(today, 'day')
      ).length,
      weekCompletedCount: all.filter(
        (a) =>
          a.status === 'COMPLETED' &&
          a.completedAt &&
          dayjs(a.completedAt).isAfter(weekStart) &&
          dayjs(a.completedAt).isBefore(weekEnd)
      ).length,
      highPriorityOpen: all.filter(
        (a) => a.status === 'OPEN' && a.priority === 'high'
      ).length,
    };
  }, [activities]);

  // ── Grouping ───────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const today = dayjs().startOf('day');

    const overdue: Activity[] = [];
    const dueToday: Activity[] = [];
    const upcoming: Activity[] = [];
    const completed: Activity[] = [];

    for (const a of activities) {
      if (a.status === 'COMPLETED') {
        completed.push(a);
        continue;
      }
      if (!a.dueDate) {
        upcoming.push(a);
        continue;
      }
      const due = dayjs(a.dueDate).startOf('day');
      if (due.isBefore(today)) overdue.push(a);
      else if (due.isSame(today)) dueToday.push(a);
      else upcoming.push(a);
    }

    // Sort each group
    const byDueAsc = (a: Activity, b: Activity) =>
      dayjs(a.dueDate ?? a.createdAt).unix() - dayjs(b.dueDate ?? b.createdAt).unix();
    const byDueDesc = (a: Activity, b: Activity) =>
      dayjs(b.completedAt ?? b.createdAt).unix() - dayjs(a.completedAt ?? a.createdAt).unix();

    return {
      overdue: overdue.sort(byDueAsc),
      dueToday: dueToday.sort(byDueAsc),
      upcoming: upcoming.sort(byDueAsc),
      completed: completed.sort(byDueDesc).slice(0, 30),
    };
  }, [activities]);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'OPEN', label: '待处理' },
    { value: 'COMPLETED', label: '已完成' },
  ];

  const typeFilters: { value: TypeFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'CALL', label: '电话' },
    { value: 'EMAIL', label: '邮件' },
    { value: 'MEETING', label: '会议' },
    { value: 'TASK', label: '任务' },
    { value: 'NOTE', label: '备注' },
  ];

  function FilterPill<T extends string>({
    options,
    value,
    onChange,
  }: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
  }) {
    return (
      <div className="flex items-center gap-1 bg-slate-100/60 rounded-xl p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'text-xs font-bold px-3 py-1.5 rounded-lg transition-all',
              value === opt.value
                ? 'bg-white text-[#1A1D2E] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#FF8D1A] font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <CalendarDays size={14} />
            <span>活动管理</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#1A1D2E]">活动 & 任务</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <FilterPill options={statusFilters} value={statusFilter} onChange={setStatusFilter} />
          </div>
          <FilterPill options={typeFilters} value={typeFilter} onChange={setTypeFilter} />
          <Button
            onClick={() => setShowCreate(true)}
            className="rounded-xl h-10 px-5 font-bold bg-[#FF8D1A] hover:bg-[#e07d15] text-white shadow-lg shadow-orange-200/40"
          >
            <Plus size={16} className="mr-1.5" />
            新建活动
          </Button>
        </div>
      </div>

      {/* ── Search Filter Bar ── */}
      <FilterBar
        fields={ACTIVITY_EXTRA_FILTERS}
        values={extraFilters}
        onChange={setExtraFilters}
        onReset={() => setExtraFilters({})}
      />

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="待办任务"
          value={stats.openCount}
          icon={<Clock size={20} className="text-[#FF8D1A]" />}
          accent="bg-orange-50"
        />
        <StatCard
          label="今日活动"
          value={stats.todayCount}
          icon={<CalendarDays size={20} className="text-blue-500" />}
          accent="bg-blue-50"
        />
        <StatCard
          label="本周完成"
          value={stats.weekCompletedCount}
          icon={<CheckSquare size={20} className="text-green-500" />}
          accent="bg-green-50"
        />
        <StatCard
          label="高优先级"
          value={stats.highPriorityOpen}
          icon={<Users size={20} className="text-red-500" />}
          accent="bg-red-50"
        />
      </div>

      {/* ── Activity Feed ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <Card className="rounded-2xl border-none shadow-lg shadow-slate-200/30 bg-white overflow-hidden">
          <CardHeader className="px-6 pt-5 pb-0">
            <CardTitle className="text-sm font-black text-ink">
              活动列表
              <span className="ml-2 text-xs font-semibold text-slate-400">({activities.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-4 space-y-2">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                <CalendarDays size={48} strokeWidth={1} />
                <p className="mt-4 text-sm font-semibold">暂无活动记录</p>
                <p className="text-xs mt-1">点击「新建活动」开始记录</p>
              </div>
            ) : (
              <>
                {/* Overdue */}
                {groups.overdue.length > 0 && (
                  <div>
                    <SectionHeader label={`已逾期 · ${groups.overdue.length}`} />
                    <div className="space-y-1">
                      {groups.overdue.map((a) => (
                        <ActivityItem
                          key={a.id}
                          activity={a}
                          onComplete={(id) => completeMutation.mutate(id)}
                          completing={completingId === a.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {groups.overdue.length > 0 && groups.dueToday.length > 0 && (
                  <Separator className="my-2" />
                )}

                {/* Today */}
                {groups.dueToday.length > 0 && (
                  <div>
                    <SectionHeader label={`今日截止 · ${groups.dueToday.length}`} />
                    <div className="space-y-1">
                      {groups.dueToday.map((a) => (
                        <ActivityItem
                          key={a.id}
                          activity={a}
                          onComplete={(id) => completeMutation.mutate(id)}
                          completing={completingId === a.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(groups.overdue.length > 0 || groups.dueToday.length > 0) &&
                  groups.upcoming.length > 0 && <Separator className="my-2" />}

                {/* Upcoming */}
                {groups.upcoming.length > 0 && (
                  <div>
                    <SectionHeader label={`即将到来 · ${groups.upcoming.length}`} />
                    <div className="space-y-1">
                      {groups.upcoming.map((a) => (
                        <ActivityItem
                          key={a.id}
                          activity={a}
                          onComplete={(id) => completeMutation.mutate(id)}
                          completing={completingId === a.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(groups.overdue.length > 0 ||
                  groups.dueToday.length > 0 ||
                  groups.upcoming.length > 0) &&
                  groups.completed.length > 0 && <Separator className="my-2" />}

                {/* Completed */}
                {groups.completed.length > 0 && (
                  <div>
                    <SectionHeader label={`已完成 · ${groups.completed.length}`} />
                    <div className="space-y-1">
                      {groups.completed.map((a) => (
                        <ActivityItem
                          key={a.id}
                          activity={a}
                          onComplete={(id) => completeMutation.mutate(id)}
                          completing={completingId === a.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── New Activity Dialog ── */}
      <NewActivityDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(data) => createMutation.mutate(data)}
        creating={createMutation.isPending}
      />
    </div>
  );
}
