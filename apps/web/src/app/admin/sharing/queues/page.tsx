'use client';
// ─── /admin/sharing/queues ──────────────────────────────────────────────────
// Queues list — Salesforce-style assignment queues backed by a PublicGroup.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  queuesApi, publicGroupsApi,
  type QueueSummary, type PublicGroupSummary,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Inbox, Plus, Loader2, RefreshCw, Trash2,
} from 'lucide-react';

const SUPPORTED_OBJECTS: { value: string; label: string }[] = [
  { value: 'lead', label: '线索 Lead' },
  { value: 'case', label: '服务工单 Case' },
];

export default function QueuesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery<QueueSummary[]>({
    queryKey: ['queues'],
    queryFn: () => queuesApi.list(),
  });

  // Fetch item-counts for each queue (small N — typically <50 queues per tenant).
  const queues = data ?? [];
  const itemCounts = useQuery({
    queryKey: ['queues-item-counts', queues.map((q) => q.id).join(',')],
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const q of queues) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const items = await queuesApi.items(q.id);
          out[q.id] = items.length;
        } catch {
          out[q.id] = 0;
        }
      }
      return out;
    },
    enabled: queues.length > 0,
    staleTime: 30_000,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => queuesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queues'] }),
  });

  return (
    <div className="p-8 space-y-6 max-w-[1300px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Inbox size={20} />
            </div>
            队列
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            队列暂存待分配的线索 / 服务工单，关联群组的成员可以「认领」记录。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          <Button
            className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} /> 新建队列
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : queues.length === 0 ? (
            <div className="p-16 text-center">
              <Inbox size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">还没有任何队列</p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                点击右上角「新建队列」开始
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-left">apiName</th>
                  <th className="px-6 py-3 text-left">支持对象</th>
                  <th className="px-6 py-3 text-left">关联群组</th>
                  <th className="px-6 py-3 text-right">条目数</th>
                  <th className="px-6 py-3 text-right w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queues.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`/admin/sharing/queues/${q.id}`)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-black text-ink">{q.label}</td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">{q.apiName}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {q.supportedObjects.map((o) => (
                          <span
                            key={o}
                            className="text-[10px] font-black px-1.5 h-4 rounded-full bg-slate-100 text-slate-600 inline-flex items-center uppercase"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {q.group ? (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-purple-50 text-purple-700 text-xs font-bold">
                          {q.group.label}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-amber-50 text-amber-700">
                        {itemCounts.data?.[q.id] ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl gap-1 font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确认删除队列 "${q.label}" 吗？`)) {
                            removeMut.mutate(q.id);
                          }
                        }}
                        disabled={removeMut.isPending}
                      >
                        <Trash2 size={12} /> 删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateQueueDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateQueueDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{
    apiName: string;
    label: string;
    supportedObjects: string[];
    groupId: string;
  }>({ apiName: '', label: '', supportedObjects: [], groupId: '' });
  const [error, setError] = useState<string | null>(null);

  const { data: groups } = useQuery<PublicGroupSummary[]>({
    queryKey: ['public-groups'],
    queryFn: () => publicGroupsApi.list(),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (d: {
      apiName: string; label: string; supportedObjects: string[]; groupId?: string | null;
    }) => queuesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queues'] });
      setForm({ apiName: '', label: '', supportedObjects: [], groupId: '' });
      setError(null);
      onOpenChange(false);
    },
    onError: (e: { response?: { data?: { message?: string } }; message: string }) => {
      setError(e.response?.data?.message ?? e.message);
    },
  });

  function toggleObj(v: string) {
    setForm((f) => {
      const has = f.supportedObjects.includes(v);
      return {
        ...f,
        supportedObjects: has
          ? f.supportedObjects.filter((x) => x !== v)
          : [...f.supportedObjects, v],
      };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apiName.trim() || !form.label.trim()) {
      setError('apiName 和 label 必填');
      return;
    }
    if (form.supportedObjects.length === 0) {
      setError('至少选择一个支持的对象');
      return;
    }
    createMut.mutate({
      apiName: form.apiName.trim(),
      label: form.label.trim(),
      supportedObjects: form.supportedObjects,
      groupId: form.groupId || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">新建队列</DialogTitle>
          <DialogDescription>
            apiName 用作系统标识符且创建后不可更改。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              apiName *
            </Label>
            <Input
              value={form.apiName}
              onChange={(e) => setForm({ ...form, apiName: e.target.value })}
              placeholder="north_leads_queue"
              className="h-10 rounded-xl font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              名称 *
            </Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="北区线索队列"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              支持对象 *
            </Label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_OBJECTS.map((o) => {
                const checked = form.supportedObjects.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleObj(o.value)}
                    className={
                      checked
                        ? 'px-3 py-1.5 text-xs font-black rounded-xl bg-ink text-white border border-ink'
                        : 'px-3 py-1.5 text-xs font-black rounded-xl bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              关联群组
            </Label>
            <Select
              value={form.groupId || '__none__'}
              onValueChange={(v) => setForm({ ...form, groupId: v === '__none__' ? '' : v })}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="（不关联群组 - 任何有权限用户均可认领）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">（不关联群组）</SelectItem>
                {(groups ?? []).filter((g) => g.isActive).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label} <span className="text-slate-400 font-mono text-xs">({g.apiName})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <div className="text-xs font-bold text-red-600 bg-red-50 rounded-lg p-2">{error}</div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl font-bold"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
              disabled={createMut.isPending}
            >
              {createMut.isPending && <Loader2 size={14} className="animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
