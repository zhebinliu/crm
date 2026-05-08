'use client';
// ─── /admin/recycle-bin ──────────────────────────────────────────────────
// SF-style Recycle Bin viewer + restore + admin-only permanent purge.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recycleBinApi } from '@/lib/api';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Trash2, RotateCcw, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';

interface RecycleBinEntry {
  id: string;
  recordType: string;
  recordId: string;
  deletedAt: string;
  deletedById: string | null;
  purgeAfter: string;
  snapshot: Record<string, unknown>;
  restoredAt: string | null;
}

const RECORD_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '__all', label: '全部' },
  { value: 'lead', label: '线索' },
  { value: 'account', label: '客户' },
  { value: 'contact', label: '联系人' },
  { value: 'opportunity', label: '商机' },
  { value: 'case', label: '工单' },
  { value: 'quote', label: '报价' },
  { value: 'order', label: '订单' },
  { value: 'contract', label: '合同' },
  { value: 'activity', label: '活动' },
];

const RECORD_TYPE_ZH: Record<string, string> = {
  lead: '线索', account: '客户', contact: '联系人', opportunity: '商机',
  case: '工单', quote: '报价', order: '订单', contract: '合同', activity: '活动',
};

const RECORD_TYPE_COLOR: Record<string, string> = {
  lead: 'bg-blue-50 text-blue-700',
  account: 'bg-emerald-50 text-emerald-700',
  contact: 'bg-cyan-50 text-cyan-700',
  opportunity: 'bg-violet-50 text-violet-700',
  case: 'bg-amber-50 text-amber-700',
  quote: 'bg-pink-50 text-pink-700',
  order: 'bg-fuchsia-50 text-fuchsia-700',
  contract: 'bg-orange-50 text-orange-700',
  activity: 'bg-slate-100 text-slate-700',
};

function snapshotName(entry: RecycleBinEntry): string {
  const s = entry.snapshot ?? {};
  const v = (k: string) => (s as Record<string, unknown>)[k];
  switch (entry.recordType) {
    case 'lead':
    case 'contact':
      return [v('firstName'), v('lastName')].filter(Boolean).join(' ') || `${v('company') ?? ''}` || entry.recordId;
    case 'account':
      return String(v('name') ?? entry.recordId);
    case 'opportunity':
      return String(v('name') ?? entry.recordId);
    case 'quote':
      return String(v('name') ?? v('quoteNumber') ?? entry.recordId);
    case 'order':
      return String(v('orderNumber') ?? entry.recordId);
    case 'contract':
      return String(v('contractNumber') ?? v('name') ?? entry.recordId);
    case 'case':
      return String(v('subject') ?? v('caseNumber') ?? entry.recordId);
    case 'activity':
      return String(v('subject') ?? entry.recordId);
    default:
      return String(v('name') ?? v('subject') ?? entry.recordId);
  }
}

export default function RecycleBinPage() {
  const qc = useQueryClient();
  const [recordType, setRecordType] = useState<string>('');
  const [confirmPurge, setConfirmPurge] = useState<RecycleBinEntry | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery<{ data: RecycleBinEntry[]; total: number }>({
    queryKey: ['recycle-bin', recordType],
    queryFn: () => recycleBinApi.list({ recordType: recordType || undefined, take: 200 }),
    staleTime: 15_000,
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => recycleBinApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recycle-bin'] }),
  });

  const purgeMut = useMutation({
    mutationFn: (id: string) => recycleBinApi.purge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recycle-bin'] });
      setConfirmPurge(null);
    },
  });

  const rows = data?.data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Trash2 size={20} />
            </div>
            回收站
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            被软删除的记录在 30 天内可以恢复，超期会由 cron 任务自动彻底清除
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl font-bold gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新
        </Button>
      </div>

      {/* Filter */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">对象类型</label>
            <Select value={recordType || '__all'} onValueChange={(v) => setRecordType(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORD_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-20 text-center">
              <div className="text-5xl mb-3">🗑️</div>
              <p className="text-base font-black text-slate-400">回收站是空的</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">类型</th>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-left">删除时间</th>
                  <th className="px-6 py-3 text-left">删除人</th>
                  <th className="px-6 py-3 text-left">清理倒计时</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center text-[10px] font-black px-2 h-5 rounded-full uppercase tracking-wider',
                        RECORD_TYPE_COLOR[r.recordType] ?? 'bg-slate-100 text-slate-600',
                      )}>
                        {RECORD_TYPE_ZH[r.recordType] ?? r.recordType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-ink truncate max-w-[300px]">
                      {snapshotName(r)}
                      <div className="text-[11px] font-mono text-slate-400 font-normal truncate">{r.recordId}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {fmtDate(r.deletedAt, 'YYYY-MM-DD HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400 truncate max-w-[160px]">
                      {r.deletedById ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-amber-600">
                      {fmtRelative(r.purgeAfter)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl gap-1 font-bold"
                          onClick={() => restoreMut.mutate(r.id)}
                          disabled={restoreMut.isPending && restoreMut.variables === r.id}
                        >
                          <RotateCcw size={12} /> 恢复
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl gap-1 font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setConfirmPurge(r)}
                        >
                          <Trash2 size={12} /> 永久删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Purge confirm */}
      <Dialog open={!!confirmPurge} onOpenChange={(b) => !b && setConfirmPurge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2 text-red-600">
              <AlertTriangle size={20} /> 永久删除？
            </DialogTitle>
            <DialogDescription>
              你即将永久删除 <span className="font-bold text-ink">{confirmPurge && snapshotName(confirmPurge)}</span>
              （{confirmPurge && (RECORD_TYPE_ZH[confirmPurge.recordType] ?? confirmPurge.recordType)}）。
              此操作 <span className="font-bold text-red-600">不可恢复</span>，记录将从数据库彻底清除。
            </DialogDescription>
          </DialogHeader>
          {purgeMut.isError && (
            <div className="text-xs font-bold text-red-600">
              失败：{(purgeMut.error as Error)?.message}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmPurge(null)}>
              取消
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2 font-bold"
              disabled={purgeMut.isPending}
              onClick={() => confirmPurge && purgeMut.mutate(confirmPurge.id)}
            >
              {purgeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              确认永久删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
