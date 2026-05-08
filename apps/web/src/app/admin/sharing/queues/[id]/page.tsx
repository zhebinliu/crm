'use client';
// ─── /admin/sharing/queues/[id] ─────────────────────────────────────────────
// Queue detail — header (edit metadata) + Items tab listing records currently
// in the queue, each with a 「认领」 button that calls /api/queues/:id/claim.

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  queuesApi, publicGroupsApi,
  type QueueSummary, type QueueItem, type PublicGroupSummary,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Inbox, Loader2, Save, Hand, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';

const SUPPORTED_OBJECTS: { value: string; label: string }[] = [
  { value: 'lead', label: '线索 Lead' },
  { value: 'case', label: '服务工单 Case' },
];

export default function QueueDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: queue, isLoading } = useQuery<QueueSummary>({
    queryKey: ['queue', id],
    queryFn: () => queuesApi.get(id),
  });

  const { data: items, isLoading: itemsLoading, isFetching: itemsFetching, refetch: refetchItems } =
    useQuery<QueueItem[]>({
      queryKey: ['queue-items', id],
      queryFn: () => queuesApi.items(id),
      enabled: !!queue,
    });

  const { data: groups } = useQuery<PublicGroupSummary[]>({
    queryKey: ['public-groups'],
    queryFn: () => publicGroupsApi.list(),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    label: string; supportedObjects: string[]; groupId: string;
  }>({ label: '', supportedObjects: [], groupId: '' });
  const [claimMsg, setClaimMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Sync form when queue loads/changes (and not editing).
  useMemo(() => {
    if (queue && !editing) {
      setForm({
        label: queue.label,
        supportedObjects: queue.supportedObjects,
        groupId: queue.groupId ?? '',
      });
    }
  }, [queue, editing]);

  const updateMut = useMutation({
    mutationFn: (d: {
      label?: string; supportedObjects?: string[]; groupId?: string | null;
    }) => queuesApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue', id] });
      qc.invalidateQueries({ queryKey: ['queues'] });
      setEditing(false);
    },
  });

  const claimMut = useMutation({
    mutationFn: ({ recordType, recordId }: { recordType: 'lead' | 'case'; recordId: string }) =>
      queuesApi.claim(id, recordType, recordId),
    onSuccess: (_d, vars) => {
      setClaimMsg({ kind: 'ok', text: `已认领 ${vars.recordType} ${vars.recordId}` });
      qc.invalidateQueries({ queryKey: ['queue-items', id] });
    },
    onError: (e: { response?: { data?: { message?: string } }; message: string }) => {
      setClaimMsg({
        kind: 'err',
        text: e.response?.data?.message ?? e.message,
      });
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

  if (isLoading || !queue) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1100px] mx-auto">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 font-bold text-slate-500"
        onClick={() => router.push('/admin/sharing/queues')}
      >
        <ArrowLeft size={14} /> 返回队列列表
      </Button>

      {/* Header card */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6">
          {!editing ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                  <Inbox size={22} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-ink tracking-tight">{queue.label}</h1>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {queue.apiName}
                    </code>
                    {queue.supportedObjects.map((o) => (
                      <span
                        key={o}
                        className="text-[10px] font-black px-1.5 h-4 rounded-full bg-slate-100 text-slate-600 inline-flex items-center uppercase"
                      >
                        {o}
                      </span>
                    ))}
                    {queue.group && (
                      <span className="text-[10px] font-black px-2 h-4 rounded-full bg-purple-50 text-purple-700 inline-flex items-center">
                        群组：{queue.group.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                className="rounded-xl font-bold"
                onClick={() => setEditing(true)}
              >
                编辑
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-black">编辑队列</h2>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  名称
                </Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  支持对象
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
                    <SelectValue placeholder="（不关联群组）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">（不关联群组）</SelectItem>
                    {(groups ?? []).filter((g) => g.isActive).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className="rounded-xl font-bold"
                  onClick={() => setEditing(false)}
                >
                  取消
                </Button>
                <Button
                  className="rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
                  disabled={updateMut.isPending}
                  onClick={() =>
                    updateMut.mutate({
                      label: form.label,
                      supportedObjects: form.supportedObjects,
                      groupId: form.groupId || null,
                    })
                  }
                >
                  {updateMut.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  保存
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">队列条目</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              当前驻留在该队列中的记录，群组成员可点击「认领」转为自己负责
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl font-bold gap-2"
            onClick={() => refetchItems()}
            disabled={itemsFetching}
          >
            {itemsFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
        </div>

        {claimMsg && (
          <div className="mx-6 mb-4">
            <div
              className={
                claimMsg.kind === 'ok'
                  ? 'flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg p-2.5'
                  : 'flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg p-2.5'
              }
            >
              {claimMsg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {claimMsg.text}
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {itemsLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : (items ?? []).length === 0 ? (
            <div className="p-16 text-center">
              <Inbox size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">队列为空</p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                没有待认领的记录
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left w-[120px]">类型</th>
                  <th className="px-6 py-3 text-left">记录</th>
                  <th className="px-6 py-3 text-right w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(items ?? []).map((it) => (
                  <tr key={`${it.recordType}-${it.id}`} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black px-2 h-5 rounded-full bg-slate-100 text-slate-600 inline-flex items-center uppercase">
                        {it.recordType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-ink">{it.label}</div>
                      <div className="text-xs font-mono text-slate-400">{it.id}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        className="h-8 rounded-xl gap-1 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() =>
                          claimMut.mutate({
                            recordType: it.recordType as 'lead' | 'case',
                            recordId: it.id,
                          })
                        }
                        disabled={claimMut.isPending}
                      >
                        <Hand size={12} /> 认领
                      </Button>
                    </td>
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
