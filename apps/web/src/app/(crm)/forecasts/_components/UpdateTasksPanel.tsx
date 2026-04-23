'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { forecastApi, adminApi } from '@/lib/api';
import { fmtMoney, cn } from '@/lib/utils';
import {
  Plus, ChevronDown, ChevronUp, Check, RefreshCw,
  Calendar, Users, X, CheckCircle2, Clock, ClipboardList,
  AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskEntry {
  id: string;
  oppId: string;
  oppName: string;
  prevAmount: any;
  prevCloseDate: string | null;
  newAmount: any;
  newCloseDate: string | null;
  noChange: boolean;
  submittedAt: string | null;
}

interface Task {
  id: string;
  title: string;
  period: string;
  dueDate: string;
  status: string;
  createdAt: string;
  targetUserIds: string[];
  dateRangeFrom: string;
  dateRangeTo: string;
  createdBy: { id: string; displayName: string };
  _count?: { entries: number };
  entries?: TaskEntry[];
}

interface LocalEntry {
  noChange: boolean;
  newAmount: string;
  newCloseDate: string;
  touched: boolean;
}

// ── CreateTaskModal ───────────────────────────────────────────────────────────

function CreateTaskModal({
  open, period, onClose, onCreated,
}: {
  open: boolean;
  period: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: usersResp } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => adminApi.listUsers({ take: 50 }),
    enabled: open,
  });
  const allUsers: any[] = usersResp?.data ?? usersResp ?? [];

  const createMutation = useMutation({
    mutationFn: (d: any) => forecastApi.createTask(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forecast-update-tasks'] });
      onCreated();
      onClose();
      setTitle(''); setDueDate(''); setDateFrom(''); setDateTo(''); setSelectedUsers([]);
    },
  });

  if (!open) return null;

  const canSubmit = title && dueDate && dateFrom && dateTo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-border w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-black text-ink">发起预测更新任务</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">任务名称</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${period} 预测更新`}
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
            />
          </div>

          {/* Period (read-only) */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">所属期间</label>
            <input
              value={period}
              readOnly
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-tertiary text-sm text-ink-secondary font-mono outline-none"
            />
          </div>

          {/* Due date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">截止日期</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
            />
          </div>

          {/* Date range for opps */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">商机关闭日期范围</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="起始日期"
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="截止日期"
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all"
              />
            </div>
          </div>

          {/* Target users */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">
              指定销售成员
              <span className="ml-1 text-ink-muted normal-case font-normal">（不选则包含全部成员）</span>
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {allUsers.filter((u: any) => u.isActive !== false).map((u: any) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-secondary cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={(e) => {
                      setSelectedUsers((prev) =>
                        e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                      );
                    }}
                    className="accent-brand"
                  />
                  <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center text-brand font-bold text-xs shrink-0">
                    {u.displayName?.[0] ?? '?'}
                  </div>
                  <span className="text-sm font-semibold text-ink">{u.displayName}</span>
                  <span className="text-xs text-ink-muted">{u.title ?? u.email}</span>
                </label>
              ))}
            </div>
          </div>

          {createMutation.isError && (
            <div className="flex items-center gap-2 text-danger text-xs p-3 bg-danger/5 rounded-xl">
              <AlertCircle size={14} />
              <span>创建失败，请重试</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2">
          <button
            onClick={() => createMutation.mutate({
              title,
              period,
              dueDate: new Date(dueDate).toISOString(),
              targetUserIds: selectedUsers,
              dateRangeFrom: new Date(dateFrom).toISOString(),
              dateRangeTo: new Date(dateTo + 'T23:59:59').toISOString(),
            })}
            disabled={!canSubmit || createMutation.isPending}
            className="flex-1 btn-primary text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {createMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            发起任务
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-ink-secondary hover:text-ink text-sm font-bold transition-all">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OppRow ────────────────────────────────────────────────────────────────────

function OppRow({
  entry,
  local,
  onChange,
  disabled,
}: {
  entry: TaskEntry;
  local: LocalEntry;
  onChange: (patch: Partial<LocalEntry>) => void;
  disabled: boolean;
}) {
  const isSubmitted = !!entry.submittedAt;
  const prevAmt = entry.prevAmount != null ? Number(entry.prevAmount) : null;
  const prevDate = entry.prevCloseDate ? entry.prevCloseDate.slice(0, 10) : '';

  return (
    <div className={cn(
      'grid grid-cols-[1fr_140px_120px_140px_120px_44px] gap-2 items-center px-4 py-2.5 border-b border-border/40 text-sm transition-colors',
      local.noChange ? 'bg-success-light/30' : 'hover:bg-surface-secondary/40',
      isSubmitted && !local.touched && 'opacity-70',
    )}>
      {/* Opp name */}
      <span className="font-semibold text-ink truncate">{entry.oppName}</span>

      {/* Prev amount */}
      <span className="text-ink-secondary font-mono text-xs text-right">
        {prevAmt != null ? fmtMoney(prevAmt) : '—'}
      </span>

      {/* Prev close date */}
      <span className="text-ink-muted text-xs text-center">
        {prevDate ? new Date(prevDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
      </span>

      {/* New amount */}
      <input
        type="number"
        min={0}
        disabled={disabled || local.noChange}
        value={local.noChange ? '' : local.newAmount}
        onChange={(e) => onChange({ newAmount: e.target.value, touched: true })}
        placeholder={prevAmt != null ? String(prevAmt) : '金额'}
        className={cn(
          'w-full px-2 py-1.5 rounded-lg border text-xs font-mono text-right outline-none transition-all',
          local.noChange
            ? 'border-border bg-surface-tertiary text-ink-muted cursor-not-allowed'
            : 'border-border bg-white focus:border-brand focus:ring-1 focus:ring-brand/10',
        )}
      />

      {/* New close date */}
      <input
        type="date"
        disabled={disabled || local.noChange}
        value={local.noChange ? '' : local.newCloseDate}
        onChange={(e) => onChange({ newCloseDate: e.target.value, touched: true })}
        className={cn(
          'w-full px-2 py-1.5 rounded-lg border text-xs outline-none transition-all',
          local.noChange
            ? 'border-border bg-surface-tertiary text-ink-muted cursor-not-allowed'
            : 'border-border bg-white focus:border-brand focus:ring-1 focus:ring-brand/10',
        )}
      />

      {/* No-change ✅ button */}
      <button
        disabled={disabled}
        onClick={() => onChange({ noChange: !local.noChange, touched: true })}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0',
          local.noChange
            ? 'bg-success text-white'
            : 'border border-border text-ink-muted hover:border-success hover:text-success',
        )}
        title={local.noChange ? '取消无变化' : '无变化（沿用上期）'}
      >
        <Check size={15} />
      </button>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, userId }: { task: Task; userId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [locals, setLocals] = useState<Record<string, LocalEntry>>({});

  const { data: taskDetail, isLoading } = useQuery({
    queryKey: ['forecast-task', task.id],
    queryFn: () => forecastApi.getTask(task.id),
    enabled: expanded,
  });

  const entries: TaskEntry[] = taskDetail?.entries ?? [];

  // Initialize locals from fetched entries
  const localEntries = useMemo(() => {
    const result: Record<string, LocalEntry> = {};
    for (const e of entries) {
      if (locals[e.oppId] !== undefined) {
        result[e.oppId] = locals[e.oppId];
      } else {
        result[e.oppId] = {
          noChange: e.noChange,
          newAmount: e.newAmount != null ? String(Number(e.newAmount)) : '',
          newCloseDate: e.newCloseDate ? e.newCloseDate.slice(0, 10) : '',
          touched: false,
        };
      }
    }
    return result;
  }, [entries, locals]);

  const submitMutation = useMutation({
    mutationFn: (submitEntries: any[]) => forecastApi.submitTask(task.id, submitEntries),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forecast-task', task.id] });
      qc.invalidateQueries({ queryKey: ['forecast-update-tasks'] });
      qc.invalidateQueries({ queryKey: ['opps-forecast'] }); // refresh opp amounts on main page
      // Reset touched state
      setLocals({});
    },
  });

  function handleSubmit() {
    const submitEntries = entries.map((e) => {
      const l = localEntries[e.oppId];
      if (!l) return { oppId: e.oppId, oppName: e.oppName, noChange: true };
      return {
        oppId: e.oppId,
        oppName: e.oppName,
        noChange: l.noChange,
        newAmount: l.noChange ? undefined : (l.newAmount ? Number(l.newAmount) : undefined),
        newCloseDate: l.noChange ? undefined : (l.newCloseDate || undefined),
      };
    });
    submitMutation.mutate(submitEntries);
  }

  const allFilled = entries.length > 0 && entries.every((e) => {
    const l = localEntries[e.oppId];
    return l?.noChange || l?.newAmount || l?.newCloseDate || !!e.submittedAt;
  });

  const submittedCount = entries.filter((e) => !!e.submittedAt).length;
  const isOverdue = new Date(task.dueDate) < new Date() && task.status === 'open';

  const statusBadge = () => {
    if (task.status === 'closed') return <span className="badge bg-success-light text-success-text text-xs">已完成</span>;
    if (isOverdue) return <span className="badge bg-danger/10 text-danger text-xs flex items-center gap-1"><AlertCircle size={10} />已逾期</span>;
    return <span className="badge bg-warning-light text-warning-text text-xs flex items-center gap-1"><Clock size={10} />进行中</span>;
  };

  return (
    <div className={cn('border border-border rounded-2xl overflow-hidden transition-all', expanded && 'shadow-md')}>
      {/* Card header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-secondary/40 transition-colors"
      >
        <div className="p-2 rounded-xl bg-brand/10 text-brand shrink-0">
          <ClipboardList size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink text-sm truncate">{task.title}</span>
            {statusBadge()}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-ink-muted flex-wrap">
            <span className="flex items-center gap-1"><Calendar size={11} />截止 {new Date(task.dueDate).toLocaleDateString('zh-CN')}</span>
            <span className="flex items-center gap-1"><Users size={11} />
              {task._count?.entries ?? entries.length} 条商机
            </span>
            {submittedCount > 0 && (
              <span className="text-success font-semibold">已提交 {submittedCount}</span>
            )}
            <span className="text-ink-muted">由 {task.createdBy?.displayName} 发起</span>
          </div>
        </div>
        <div className="text-ink-muted shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="py-10 text-center text-ink-muted text-sm">加载中…</div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-ink-muted text-sm">暂无分配给您的商机</div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_140px_120px_140px_120px_44px] gap-2 px-4 py-2 bg-surface-secondary border-b border-border text-xs font-bold text-ink-secondary uppercase tracking-wider">
                <span>商机名称</span>
                <span className="text-right">上期金额</span>
                <span className="text-center">上期日期</span>
                <span className="text-right">本期金额</span>
                <span className="text-center">本期日期</span>
                <span className="text-center">✓</span>
              </div>

              {/* Opp rows */}
              {entries.map((e) => (
                <OppRow
                  key={e.oppId}
                  entry={e}
                  local={localEntries[e.oppId] ?? { noChange: false, newAmount: '', newCloseDate: '', touched: false }}
                  onChange={(patch) => setLocals((prev) => ({
                    ...prev,
                    [e.oppId]: { ...localEntries[e.oppId], ...patch },
                  }))}
                  disabled={submitMutation.isPending}
                />
              ))}

              {/* Submit bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-surface-secondary/50 border-t border-border">
                <p className="text-xs text-ink-muted">
                  {allFilled
                    ? <span className="text-success font-semibold flex items-center gap-1"><CheckCircle2 size={12} />所有商机已确认</span>
                    : `还有 ${entries.filter((e) => { const l = localEntries[e.oppId]; return !l?.noChange && !l?.newAmount && !e.submittedAt; }).length} 条待确认`}
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending || entries.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl btn-primary text-sm font-bold disabled:opacity-50"
                >
                  {submitMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                  提交更新
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── UpdateTasksPanel ──────────────────────────────────────────────────────────

export function UpdateTasksPanel({
  isManager,
  period,
  userId,
}: {
  isManager: boolean;
  period: string;
  userId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ['forecast-update-tasks'],
    queryFn: () => forecastApi.listTasks(),
  });

  // Filter to current period
  const periodTasks = useMemo(
    () => (tasks as Task[]).filter((t) => t.period === period),
    [tasks, period],
  );

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-brand" />
          <h3 className="font-black text-ink text-base">预测更新任务</h3>
          {periodTasks.length > 0 && (
            <span className="badge bg-brand/10 text-brand text-xs">{periodTasks.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-surface-secondary text-ink-muted transition-all">
            <RefreshCw size={14} />
          </button>
          {isManager && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-primary text-xs font-bold"
            >
              <Plus size={13} />
              发起更新任务
            </button>
          )}
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="card p-10 text-center text-ink-muted text-sm">加载中…</div>
      ) : periodTasks.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <ClipboardList size={32} className="mx-auto text-ink-muted/30" />
          <p className="text-sm text-ink-muted">
            {isManager ? `${period} 尚未发起预测更新任务` : '暂无需要您填写的预测更新任务'}
          </p>
          {isManager && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mx-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border border-brand text-brand text-xs font-bold hover:bg-brand/5 transition-colors mt-2"
            >
              <Plus size={13} />
              立即发起
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {periodTasks.map((task) => (
            <TaskCard key={task.id} task={task} userId={userId} />
          ))}
        </div>
      )}

      {/* Create modal */}
      <CreateTaskModal
        open={createOpen}
        period={period}
        onClose={() => setCreateOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['forecast-update-tasks'] })}
      />
    </div>
  );
}
