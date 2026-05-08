'use client';
// ─── /admin/profiles/[id] (Wave 20d) ──────────────────────────────────────
// Edit a Profile: object CRUD matrix, system perms, field perms, assign user.

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi, mePermissionsApi, ProfileDto } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, Save, Trash2, ChevronLeft, ShieldCheck, UserPlus, Lock, Eye, AlertTriangle,
} from 'lucide-react';
import { fmtRelative } from '@/lib/utils';
import {
  ObjectCrudMatrix, SystemPermsPanel, FieldPermsPanel,
} from '@/components/admin/permissions/editors';
import { useDebouncedSave, SaveStatus } from '@/components/admin/permissions/use-debounced-save';
import { UserPicker } from '@/components/admin/permissions/user-picker';

export default function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<ProfileDto>({
    queryKey: ['admin-profile', id],
    queryFn: () => profilesApi.get(id),
  });

  // Local edited state
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [objectCrud, setObjectCrud] = useState<ProfileDto['objectCrud']>({});
  const [fieldPerms, setFieldPerms] = useState<ProfileDto['fieldPerms']>({});
  const [systemPerms, setSystemPerms] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setLabel(data.label);
    setDescription(data.description ?? '');
    setObjectCrud(data.objectCrud ?? {});
    setFieldPerms(data.fieldPerms ?? {});
    setSystemPerms(data.systemPerms ?? []);
  }, [data]);

  // ── Debounced autosave per panel ─────────────────────────────────────────
  const objSave = useDebouncedSave(objectCrud, async (v) => {
    await profilesApi.update(id, { objectCrud: v });
    qc.invalidateQueries({ queryKey: ['admin-profile', id] });
    qc.invalidateQueries({ queryKey: ['admin-profiles'] });
  });
  const sysSave = useDebouncedSave(systemPerms, async (v) => {
    await profilesApi.update(id, { systemPerms: v });
    qc.invalidateQueries({ queryKey: ['admin-profile', id] });
  });
  const fieldSave = useDebouncedSave(fieldPerms, async (v) => {
    await profilesApi.update(id, { fieldPerms: v });
    qc.invalidateQueries({ queryKey: ['admin-profile', id] });
  });

  // ── Header save (label/description) — explicit ───────────────────────────
  const headerMut = useMutation({
    mutationFn: () => profilesApi.update(id, { label, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-profile', id] }),
  });
  const removeMut = useMutation({
    mutationFn: () => profilesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      router.push('/admin/profiles');
    },
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">未找到该 Profile</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push('/admin/profiles')}>
          返回列表
        </Button>
      </div>
    );
  }

  const isSystem = data.isSystem;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <button
          onClick={() => router.push('/admin/profiles')}
          className="text-xs font-bold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <ChevronLeft size={12} /> 返回 Profile 列表
        </button>
      </div>

      {/* Header card */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-black text-ink">{data.label}</h1>
                  {isSystem && (
                    <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black">
                      <Lock size={10} /> 系统 Profile
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">{data.apiName}</div>
                <div className="text-[11px] font-bold text-slate-400 mt-1">
                  更新于 {fmtRelative(data.updatedAt)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-9 rounded-xl gap-1 font-bold"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye size={14} /> 我的有效权限预览
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl gap-1 font-bold text-red-600 hover:bg-red-50 border-red-200"
                disabled={isSystem || removeMut.isPending}
                onClick={() => {
                  if (confirm('确认删除该 Profile？该操作不可恢复。')) removeMut.mutate();
                }}
              >
                <Trash2 size={14} /> 删除
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">名称</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={isSystem}
                className="h-9 rounded-xl"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">描述</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSystem}
                rows={2}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-9 rounded-xl gap-1 font-bold bg-ink hover:bg-slate-800 text-white"
              disabled={isSystem || headerMut.isPending}
              onClick={() => headerMut.mutate()}
            >
              {headerMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存基本信息
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="objects">
        <TabsList className="bg-white rounded-2xl p-1 shadow-sm">
          <TabsTrigger value="objects">对象 CRUD</TabsTrigger>
          <TabsTrigger value="system">系统权限</TabsTrigger>
          <TabsTrigger value="fields">字段权限</TabsTrigger>
          <TabsTrigger value="users">已分配用户</TabsTrigger>
        </TabsList>

        <TabsContent value="objects" className="mt-4">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-ink">对象级 CRUD 矩阵</h2>
                <SaveStatus status={objSave.status} />
              </div>
              <ObjectCrudMatrix value={objectCrud} onChange={setObjectCrud} disabled={isSystem} />
              {objSave.error && (
                <p className="text-xs font-bold text-red-600">{objSave.error}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-4">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-ink">系统级权限</h2>
                <SaveStatus status={sysSave.status} />
              </div>
              <SystemPermsPanel value={systemPerms} onChange={setSystemPerms} disabled={isSystem} />
              {sysSave.error && <p className="text-xs font-bold text-red-600">{sysSave.error}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="mt-4">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-ink">字段级权限</h2>
                <SaveStatus status={fieldSave.status} />
              </div>
              <FieldPermsPanel value={fieldPerms} onChange={setFieldPerms} disabled={isSystem} />
              {fieldSave.error && <p className="text-xs font-bold text-red-600">{fieldSave.error}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-ink">已分配用户</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    后台未提供"按 Profile 列出已分配用户"的接口；如需查询请前往用户详情或调用 <span className="font-mono">/api/me/permissions</span>。
                  </p>
                </div>
                <Button
                  className="h-9 rounded-xl gap-1 font-bold bg-ink hover:bg-slate-800 text-white"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserPlus size={14} /> 分配用户
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssignProfileDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        profileId={id}
        profileLabel={data.label}
      />
      <PermissionsPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}

function AssignProfileDialog({
  open,
  onOpenChange,
  profileId,
  profileLabel,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  profileId: string;
  profileLabel: string;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const assignMut = useMutation({
    mutationFn: () => profilesApi.assignUser(profileId, userId!),
    onSuccess: () => {
      onOpenChange(false);
      setUserId(null);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">分配 Profile «{profileLabel}»</DialogTitle>
          <DialogDescription>
            每个用户只能拥有一个 Profile。重新分配将覆盖该用户当前的 Profile。
          </DialogDescription>
        </DialogHeader>
        <UserPicker value={userId} onChange={(id) => setUserId(id)} />
        {assignMut.isError && (
          <p className="text-xs font-bold text-red-600 mt-2">{(assignMut.error as Error).message}</p>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white"
            disabled={!userId || assignMut.isPending}
            onClick={() => assignMut.mutate()}
          >
            {assignMut.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserPlus size={14} className="mr-1" />}
            分配
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsPreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['me-permissions'],
    queryFn: () => mePermissionsApi.resolved(),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Eye size={18} /> 当前管理员的有效权限
          </DialogTitle>
          <DialogDescription>
            来自 <span className="font-mono">/api/me/permissions</span> — 反映合并 Profile + Permission Set 后的扁平权限。
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="p-6 text-center"><Loader2 size={16} className="animate-spin mx-auto text-slate-300" /></div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="text-xs font-bold text-slate-500">
              {data.legacyFallback && (
                <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black mr-2">
                  legacy fallback
                </span>
              )}
              共 {data.flat.length} 条
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.flat.sort().map((p) => (
                <span key={p} className="px-2 h-6 inline-flex items-center rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono font-bold">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
