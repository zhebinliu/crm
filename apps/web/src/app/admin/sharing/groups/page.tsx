'use client';
// ─── /admin/sharing/groups ──────────────────────────────────────────────────
// Public Groups list — admin CRUD for tenant-scoped user/role groups used
// as Queue membership pools and as RecordShare grantees.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { publicGroupsApi, type PublicGroupSummary } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  UsersRound, Plus, Loader2, RefreshCw, Trash2,
} from 'lucide-react';
import { fmtRelative } from '@/lib/utils';

export default function PublicGroupsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery<PublicGroupSummary[]>({
    queryKey: ['public-groups'],
    queryFn: () => publicGroupsApi.list(),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => publicGroupsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-groups'] }),
  });

  const rows = data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1300px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <UsersRound size={20} />
            </div>
            公共群组
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            按用户或角色组合的群组，可作为 RecordShare 受让方与队列成员池。
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
            <Plus size={14} /> 新建群组
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
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <UsersRound size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">还没有任何群组</p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                点击右上角「新建群组」开始
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-left">apiName</th>
                  <th className="px-6 py-3 text-right">成员数</th>
                  <th className="px-6 py-3 text-left">状态</th>
                  <th className="px-6 py-3 text-right">创建时间</th>
                  <th className="px-6 py-3 text-right w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => router.push(`/admin/sharing/groups/${g.id}`)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-ink">{g.label}</div>
                      {g.description && (
                        <div className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                          {g.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">{g.apiName}</td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-blue-50 text-blue-700">
                        {g._count?.members ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold">
                      {g.isActive ? (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-emerald-50 text-emerald-700">
                          启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-slate-100 text-slate-500">
                          停用
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(g.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl gap-1 font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确认删除群组 "${g.label}" 吗？`)) {
                            removeMut.mutate(g.id);
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

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateGroupDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ apiName: '', label: '', description: '' });
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (d: { apiName: string; label: string; description?: string }) =>
      publicGroupsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-groups'] });
      setForm({ apiName: '', label: '', description: '' });
      setError(null);
      onOpenChange(false);
    },
    onError: (e: { response?: { data?: { message?: string } }; message: string }) => {
      setError(e.response?.data?.message ?? e.message);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apiName.trim() || !form.label.trim()) {
      setError('apiName 和 label 必填');
      return;
    }
    createMut.mutate({
      apiName: form.apiName.trim(),
      label: form.label.trim(),
      description: form.description.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">新建公共群组</DialogTitle>
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
              placeholder="sales_managers"
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
              placeholder="销售经理团队"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              描述
            </Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="（可选）说明该群组用途"
              className="rounded-xl"
              rows={3}
            />
          </div>
          {error && (
            <div className="text-xs font-bold text-red-600 bg-red-50 rounded-lg p-2">
              {error}
            </div>
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
