'use client';
// ─── /admin/dashboards ──────────────────────────────────────────────────
// Dashboards list — same shape as Reports.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, type Dashboard } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  PieChart, Plus, Search, Eye, Pencil, Trash2, Loader2, RefreshCw, AlertTriangle,
} from 'lucide-react';

export default function DashboardsListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Dashboard | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => dashboardApi.list(),
    staleTime: 15_000,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => dashboardApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      setConfirmDelete(null);
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <PieChart size={20} />
            </div>
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            把多个报表组合到一个看板上，一目了然
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
            className="h-11 rounded-xl font-bold gap-2 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={16} /> 新建 Dashboard
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Dashboard 名称或描述……"
              className="pl-10 h-11 rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

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
          ) : filtered.length === 0 ? (
            <div className="p-20 text-center">
              <div className="text-5xl mb-3">📈</div>
              <p className="text-base font-black text-slate-400">还没有 Dashboard，点击右上角新建一个</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-left">公开</th>
                  <th className="px-6 py-3 text-left">拥有者</th>
                  <th className="px-6 py-3 text-left">创建时间</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-ink truncate max-w-[260px]">{r.name}</div>
                      {r.description ? (
                        <div className="text-[11px] font-medium text-slate-400 truncate max-w-[260px]">
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold">
                      {r.isPublic ? (
                        <span className="text-emerald-600">公开</span>
                      ) : (
                        <span className="text-slate-400">私有</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400 truncate max-w-[160px]">
                      {r.ownerId}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {fmtDate(r.createdAt, 'YYYY-MM-DD HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl gap-1 font-bold"
                          onClick={() => router.push(`/admin/dashboards/${r.id}`)}
                        >
                          <Eye size={12} /> 查看
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl gap-1 font-bold"
                          onClick={() => router.push(`/admin/dashboards/${r.id}/edit`)}
                        >
                          <Pencil size={12} /> 编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl gap-1 font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setConfirmDelete(r)}
                        >
                          <Trash2 size={12} /> 删除
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

      <CreateDashboardDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Dialog open={!!confirmDelete} onOpenChange={(b) => !b && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2 text-red-600">
              <AlertTriangle size={20} /> 删除 Dashboard？
            </DialogTitle>
            <DialogDescription>
              你即将删除 <span className="font-bold text-ink">{confirmDelete?.name}</span>。该操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          {removeMut.isError && (
            <div className="text-xs font-bold text-red-600">
              失败：{(removeMut.error as Error)?.message}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2 font-bold"
              disabled={removeMut.isPending}
              onClick={() => confirmDelete && removeMut.mutate(confirmDelete.id)}
            >
              {removeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDashboardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      dashboardApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      onClose();
      router.push(`/admin/dashboards/${d.id}/edit`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">新建 Dashboard</DialogTitle>
          <DialogDescription>给你的 Dashboard 起个名字</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：销售月报看板"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">描述</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 rounded-xl"
              placeholder="可选"
            />
          </div>
          {createMut.isError && (
            <div className="text-xs font-bold text-red-600">
              创建失败：{(createMut.error as Error)?.message}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>取消</Button>
          <Button
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            创建并编辑
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
