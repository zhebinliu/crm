'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone, Mail, Users, CheckSquare, FileText,
  Plus, X, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Activity {
  id: string;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'NOTE';
  subject: string;
  description?: string | null;
  status: 'OPEN' | 'COMPLETED';
  dueDate?: string | null;
  completedAt?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: string;
}

export interface ActivityTimelineProps {
  relatedToType: string;
  relatedToId: string;
  compact?: boolean;
}

// ── Activity type config ───────────────────────────────────────────────────────

const TYPE_CONFIG = {
  CALL:    { icon: Phone,       bg: 'bg-blue-50',   iconColor: 'text-blue-500',   label: '电话' },
  EMAIL:   { icon: Mail,        bg: 'bg-purple-50',  iconColor: 'text-purple-500', label: '邮件' },
  MEETING: { icon: Users,       bg: 'bg-green-50',   iconColor: 'text-green-500',  label: '会议' },
  TASK:    { icon: CheckSquare, bg: 'bg-amber-50',   iconColor: 'text-amber-500',  label: '任务' },
  NOTE:    { icon: FileText,    bg: 'bg-slate-100',  iconColor: 'text-slate-500',  label: '备注' },
} as const;

const ACTIVITY_TYPES: (keyof typeof TYPE_CONFIG)[] = ['CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE'];

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="relative pl-14 pb-6">
      <div className="absolute left-0 w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="space-y-2 pt-1">
        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-3 w-72 bg-slate-100 rounded animate-pulse" />
        <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ── Mini Form ──────────────────────────────────────────────────────────────────

interface MiniFormProps {
  relatedToType: string;
  relatedToId: string;
  onClose: () => void;
}

function MiniForm({ relatedToType, relatedToId, onClose }: MiniFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: 'CALL' as keyof typeof TYPE_CONFIG,
    subject: '',
    description: '',
    dueDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (data: unknown) => activitiesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', relatedToType, relatedToId] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.subject.trim()) errs.subject = '主题不能为空';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    mutation.mutate({
      type: form.type,
      subject: form.subject.trim(),
      description: form.description.trim() || undefined,
      dueDate: form.dueDate || undefined,
      targetType: relatedToType,
      targetId: relatedToId,
    });
  }

  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-black text-slate-700">记录新活动</p>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">类型</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as keyof typeof TYPE_CONFIG }))}
            >
              <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="rounded-lg text-sm">
                    {TYPE_CONFIG[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">截止日期</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="rounded-xl border-slate-200 h-9 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            主题 <span className="text-red-500">*</span>
          </Label>
          <Input
            placeholder="活动主题"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className={`rounded-xl border-slate-200 h-9 text-sm ${errors.subject ? 'border-red-400' : ''}`}
          />
          {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">描述</Label>
          <textarea
            rows={2}
            placeholder="可选备注…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
          />
        </div>
        {mutation.isError && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">保存失败，请重试</p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl border-slate-200 h-8 px-4 font-bold text-xs"
          >
            取消
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending}
            className="rounded-xl bg-brand hover:bg-brand-deep text-white h-8 px-4 font-bold text-xs shadow-md shadow-brand/20"
          >
            {mutation.isPending ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
            保存
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Activity Item ──────────────────────────────────────────────────────────────

interface ActivityItemProps {
  activity: Activity;
  relatedToType: string;
  relatedToId: string;
  compact?: boolean;
}

function ActivityItem({ activity, relatedToType, relatedToId, compact }: ActivityItemProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const completeMutation = useMutation({
    mutationFn: () => activitiesApi.complete(activity.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', relatedToType, relatedToId] });
    },
  });

  const cfg = TYPE_CONFIG[activity.type] ?? TYPE_CONFIG.NOTE;
  const Icon = cfg.icon;

  const dateLabel = activity.status === 'COMPLETED' && activity.completedAt
    ? `完成于 ${fmtDate(activity.completedAt, 'MM-DD HH:mm')}`
    : activity.dueDate
    ? `截止 ${fmtDate(activity.dueDate, 'MM-DD')}`
    : `创建于 ${fmtDate(activity.createdAt, 'MM-DD HH:mm')}`;

  const hasDescription = activity.description && activity.description.trim().length > 0;
  const descTruncated = hasDescription && !expanded && activity.description!.length > 80;

  return (
    <div className="relative pl-14 pb-6 group">
      {/* Icon circle */}
      <div
        className={`absolute left-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border border-white ${cfg.bg}`}
      >
        <Icon size={16} className={cfg.iconColor} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-800 leading-tight">{activity.subject}</p>
            <Badge
              variant="outline"
              className={`border-none text-xs font-bold px-2 py-0.5 ${
                activity.status === 'COMPLETED'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {activity.status === 'COMPLETED' ? '已完成' : '待处理'}
            </Badge>
          </div>

          {hasDescription && !compact && (
            <p className="text-xs text-slate-500 leading-relaxed">
              {descTruncated
                ? `${activity.description!.slice(0, 80)}…`
                : activity.description}
              {hasDescription && activity.description!.length > 80 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="ml-1 text-brand hover:underline font-medium inline-flex items-center gap-0.5"
                >
                  {expanded ? <><ChevronUp size={11} /> 收起</> : <><ChevronDown size={11} /> 展开</>}
                </button>
              )}
            </p>
          )}

          <p className="text-xs text-slate-400 font-medium">{dateLabel}</p>
        </div>

        {activity.status === 'OPEN' && (
          <Button
            size="sm"
            variant="outline"
            disabled={completeMutation.isPending}
            onClick={() => completeMutation.mutate()}
            className="rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 h-7 px-3 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {completeMutation.isPending ? <Loader2 size={11} className="animate-spin mr-1" /> : null}
            完成
          </Button>
        )}
      </div>
    </div>
  );
}

// ── ActivityTimeline ───────────────────────────────────────────────────────────

export function ActivityTimeline({ relatedToType, relatedToId, compact }: ActivityTimelineProps) {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['activities', relatedToType, relatedToId],
    queryFn: () => activitiesApi.list({ targetType: relatedToType, targetId: relatedToId, take: 20 }),
    enabled: !!relatedToId,
  });

  const activities: Activity[] = data?.data ?? data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-800">活动记录</h3>
          {!isLoading && (
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              共 <span className="font-black text-slate-600">{activities.length}</span> 条记录
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-brand hover:bg-brand-deep text-white h-8 px-4 font-bold text-xs shadow-md shadow-brand/20 gap-1.5"
        >
          <Plus size={13} />
          记录活动
        </Button>
      </div>

      {/* Mini Form */}
      {showForm && (
        <MiniForm
          relatedToType={relatedToType}
          relatedToId={relatedToId}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        {(isLoading || activities.length > 0) && (
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
        )}

        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-300">
              <FileText size={22} />
            </div>
            <p className="text-sm text-slate-400 font-medium">
              暂无活动记录，点击"记录活动"开始跟踪
            </p>
          </div>
        ) : (
          activities.map((activity) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              relatedToType={relatedToType}
              relatedToId={relatedToId}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
}
