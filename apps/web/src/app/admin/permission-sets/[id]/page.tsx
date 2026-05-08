'use client';
// ─── /admin/permission-sets/[id] (Wave 20d) ───────────────────────────────
// Same shape as Profile detail + an "已分配" tab with expiresAt + revoke.

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { permissionSetsApi, mePermissionsApi, PermissionSetDto } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, Save, Trash2, ChevronLeft, KeyRound, UserPlus, Eye, AlertTriangle, Power,
} from 'lucide-react';
import { fmtRelative } from '@/lib/utils';
import {
  ObjectCrudMatrix, SystemPermsPanel, FieldPermsPanel,
} from '@/components/admin/permissions/editors';
import { useDebouncedSave, SaveStatus } from '@/components/admin/permissions/use-debounced-save';
import { UserPicker } from '@/components/admin/permissions/user-picker';

export default function PermissionSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<PermissionSetDto>({
    queryKey: ['admin-permission-set', id],
    queryFn: () => permissionSetsApi.get(id),
  });

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [objectCrud, setObjectCrud] = useState<PermissionSetDto['objectCrud']>({});
  const [fieldPerms, setFieldPerms] = useState<PermissionSetDto['fieldPerms']>({});
  const [systemPerms, setSystemPerms] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setLabel(data.label);
    setDescription(data.description ?? '');
    setObjectCrud(data.objectCrud ?? {});
    setFieldPerms(data.fieldPerms ?? {});
    setSystemPerms(data.systemPerms ?? []);
  }, [data]);

  const objSave = useDebouncedSave(objectCrud, async (v) => {
    await permissionSetsApi.update(id, { objectCrud: v });
    qc.invalidateQueries({ queryKey: ['admin-permission-set', id] });
    qc.invalidateQueries({ queryKey: ['admin-permission-sets'] });
  });
  const sysSave = useDebouncedSave(systemPerms, async (v) => {
    await permissionSetsApi.update(id, { systemPerms: v });
    qc.invalidateQueries({ queryKey: ['admin-permission-set', id] });
  });
  const fieldSave = useDebouncedSave(fieldPerms, async (v) => {
    await permissionSetsApi.update(id, { fieldPerms: v });
    qc.invalidateQueries({ queryKey: ['admin-permission-set', id] });
  });

  const headerMut = useMutation({
    mutationFn: () => permissionSetsApi.update(id, { label, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-permission-set', id] }),
  });
  const toggleActiveMut = useMutation({
    mutationFn: (next: boolean) => permissionSetsApi.update(id, { isActive: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-permission-set', id] }),
  });
  const removeMut = useMutation({
    mutationFn: () => permissionSetsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-permission-sets'] });
      router.push('/admin/permission-sets');
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
        <p className="text-base font-black text-red-500">未找到该 Permission Set</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push('/admin/permission-sets')}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <button
          onClick={() => router.push('/admin/permission-sets')}
          className="text-xs font-bold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <ChevronLeft size={12} /> 返回 Permission Set 列表
        </button>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                <KeyRound size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-black text-ink">{data.label}</h1>
                  <span className={
                    data.isActive
                      ? 'inline-flex items-center px-2 h-5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black'
                      : 'inline-flex items-center px-2 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black'
                  }>
                    {data.isActive ? '启用' : '禁用'}
                  </span>
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
                className="h-9 rounded-xl gap-1 font-bold"
                disabled={toggleActiveMut.isPending}
                onClick={() => toggleActiveMut.mutate(!data.isActive)}
              >
                <Power size={14} /> {data.isActive ? '停用' : '启用'}
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl gap-1 font-bold text-red-600 hover:bg-red-50 border-red-200"
                disabled={removeMut.isPending}
                onClick={() => {
                  if (confirm('确认删除该 Permission Set？所有用户的分配将一并解除。')) removeMut.mutate();
                }}
              >
                <Trash2 size={14} /> 删除
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">名称</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">描述</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-9 rounded-xl gap-1 font-bold bg-ink hover:bg-slate-800 text-white"
              disabled={headerMut.isPending}
              onClick={() => headerMut.mutate()}
            >
              {headerMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存基本信息
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="objects">
        <TabsList className="bg-white rounded-2xl p-1 shadow-sm">
          <TabsTrigger value="objects">对象 CRUD</TabsTrigger>
          <TabsTrigger value="system">系统权限</TabsTrigger>
          <TabsTrigger value="fields">字段权限</TabsTrigger>
          <TabsTrigger value="users">已分配</TabsTrigger>
        </TabsList>

        <TabsContent value="objects" className="mt-4">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-ink">对象级 CRUD 矩阵</h2>
                <SaveStatus status={objSave.status} />
              </div>
              <ObjectCrudMatrix value={objectCrud} onChange={setObjectCrud} />
              {objSave.error && <p className="text-xs font-bold text-red-600">{objSave.error}</p>}
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
              <SystemPermsPanel value={systemPerms} onChange={setSystemPerms} />
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
              <FieldPermsPanel value={fieldPerms} onChange={setFieldPerms} />
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
                    后台未提供"按 Permission Set 列出已分配用户"的接口；分配后请用 <span className="font-mono">/api/me/permissions</span> 自行验证。
                  </p>
                </div>
                <Button
                  className="h-9 rounded-xl gap-1 font-bold bg-ink hover:bg-slate-800 text-white"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserPlus size={14} /> 分配用户
                </Button>
              </div>
              <RevokeByIdRow permissionSetId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssignPermSetDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        permissionSetId={id}
        permissionSetLabel={data.label}
      />
      <PermissionsPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}

// ── Manual revoke by user-id (since no enumeration endpoint exists) ───────
function RevokeByIdRow({ permissionSetId }: { permissionSetId: string }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const revoke = useMutation({
    mutationFn: () => permissionSetsApi.revokeUser(permissionSetId, userId.trim()),
    onSuccess: () => {
      setUserId('');
      qc.invalidateQueries({ queryKey: ['me-permissions'] });
    },
  });
  return (
    <div className="rounded-2xl bg-slate-50/60 border border-slate-100 p-4 space-y-2">
      <div className="text-xs font-black text-slate-600">通过 userId 解除分配</div>
      <div className="flex items-center gap-2">
        <Input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="粘贴 user.id"
          className="h-9 rounded-xl font-mono text-xs"
        />
        <Button
          variant="outline"
          className="h-9 rounded-xl gap-1 font-bold text-red-600 hover:bg-red-50 border-red-200"
          disabled={!userId.trim() || revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          {revoke.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          解除
        </Button>
      </div>
      {revoke.isError && <p className="text-xs font-bold text-red-600">{(revoke.error as Error).message}</p>}
      {revoke.isSuccess && <p className="text-xs font-bold text-emerald-600">已解除分配</p>}
    </div>
  );
}

function AssignPermSetDialog({
  open,
  onOpenChange,
  permissionSetId,
  permissionSetLabel,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  permissionSetId: string;
  permissionSetLabel: string;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string>('');

  const assignMut = useMutation({
    mutationFn: () =>
      permissionSetsApi.assignUser(
        permissionSetId,
        userId!,
        expiresAt ? new Date(expiresAt).toISOString() : null,
      ),
    onSuccess: () => {
      onOpenChange(false);
      setUserId(null);
      setExpiresAt('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">分配 Permission Set «{permissionSetLabel}»</DialogTitle>
          <DialogDescription>
            可叠加到任意用户。可选过期时间用于临时授权（如审计窗口）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <UserPicker value={userId} onChange={(id) => setUserId(id)} />
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">过期时间（可选）</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-9 rounded-xl"
            />
          </div>
        </div>
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
