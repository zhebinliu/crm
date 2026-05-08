'use client';
// ─── /admin/profiles (Wave 20d) ───────────────────────────────────────────
// List Profiles (baseline permission templates). Each user has at most ONE.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi, ProfileDto } from '@/lib/api';
import { fmtRelative } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ShieldCheck, Plus, Loader2, RefreshCw, XCircle, Lock } from 'lucide-react';

export default function ProfilesListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery<ProfileDto[]>({
    queryKey: ['admin-profiles'],
    queryFn: () => profilesApi.list(),
    staleTime: 15_000,
  });

  const rows = data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </div>
            Profile（权限基线）
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            每个用户必须分配一个 Profile 作为权限基线，Permission Set 会在其上叠加。
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
            className="h-11 rounded-xl font-bold gap-2 bg-ink hover:bg-slate-800 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} /> 新建 Profile
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <XCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <ShieldCheck size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">尚无 Profile</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-left">apiName</th>
                  <th className="px-6 py-3 text-left">系统标签</th>
                  <th className="px-6 py-3 text-right">系统权限</th>
                  <th className="px-6 py-3 text-right">对象权限</th>
                  <th className="px-6 py-3 text-right">字段权限</th>
                  <th className="px-6 py-3 text-right">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/admin/profiles/${p.id}`)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-ink">{p.label}</div>
                      {p.description && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{p.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-600">{p.apiName}</td>
                    <td className="px-6 py-4">
                      {p.isSystem ? (
                        <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black">
                          <Lock size={10} /> 系统
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-slate-50 text-slate-500 text-[10px] font-black">自定义</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums text-violet-700">
                      {(p.systemPerms ?? []).length}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums text-blue-700">
                      {Object.keys(p.objectCrud ?? {}).length}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums text-emerald-700">
                      {Object.keys(p.fieldPerms ?? {}).length}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateProfileDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(p) => {
          qc.invalidateQueries({ queryKey: ['admin-profiles'] });
          router.push(`/admin/profiles/${p.id}`);
        }}
      />
    </div>
  );
}

function CreateProfileDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (p: ProfileDto) => void;
}) {
  const [apiName, setApiName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      profilesApi.create({ apiName: apiName.trim(), label: label.trim(), description: description.trim() || undefined }),
    onSuccess: (p) => {
      onCreated(p);
      setApiName('');
      setLabel('');
      setDescription('');
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">新建 Profile</DialogTitle>
          <DialogDescription>创建一个权限基线模板。系统级 Profile 仅可由后台预置创建。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">apiName *</label>
            <Input
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              placeholder="例如 sales_rep"
              className="h-10 rounded-xl font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">名称 *</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="销售代表"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">描述</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选"
              className="h-10 rounded-xl"
            />
          </div>
          {create.isError && (
            <p className="text-xs font-bold text-red-600">{(create.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white"
            disabled={!apiName.trim() || !label.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
