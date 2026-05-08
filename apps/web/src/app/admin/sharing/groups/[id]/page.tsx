'use client';
// ─── /admin/sharing/groups/[id] ─────────────────────────────────────────────
// Public Group detail — edit metadata, list and manage members (user / role).

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  publicGroupsApi, adminApi,
  type PublicGroupDetail, type PublicGroupMember,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, UsersRound, User, Briefcase, Plus, Loader2, Save, Trash2, Search, Check,
} from 'lucide-react';
import { fmtRelative } from '@/lib/utils';

interface UserRow {
  id: string;
  displayName: string;
  email?: string;
}

interface RoleRow {
  id: string;
  name: string;
  description?: string | null;
}

export default function PublicGroupDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: group, isLoading } = useQuery<PublicGroupDetail>({
    queryKey: ['public-group', id],
    queryFn: () => publicGroupsApi.get(id),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: '', description: '', isActive: true });
  const [addOpen, setAddOpen] = useState(false);

  // Re-sync form when group loads/changes.
  useMemo(() => {
    if (group && !editing) {
      setForm({
        label: group.label,
        description: group.description ?? '',
        isActive: group.isActive,
      });
    }
  }, [group, editing]);

  const updateMut = useMutation({
    mutationFn: (d: { label?: string; description?: string | null; isActive?: boolean }) =>
      publicGroupsApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-group', id] });
      qc.invalidateQueries({ queryKey: ['public-groups'] });
      setEditing(false);
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (memberId: string) => publicGroupsApi.removeMember(id, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-group', id] }),
  });

  if (isLoading || !group) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }

  const members = group.members ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1100px] mx-auto">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 font-bold text-slate-500"
        onClick={() => router.push('/admin/sharing/groups')}
      >
        <ArrowLeft size={14} /> 返回群组列表
      </Button>

      {/* Header card */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6">
          {!editing ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                  <UsersRound size={22} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-ink tracking-tight">{group.label}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {group.apiName}
                    </code>
                    {group.isActive ? (
                      <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center">
                        启用
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-slate-100 text-slate-500 inline-flex items-center">
                        停用
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-sm text-slate-500 mt-2">{group.description}</p>
                  )}
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
              <h2 className="text-lg font-black">编辑群组</h2>
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
                  描述
                </Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="rounded-xl"
                  rows={3}
                />
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span className="text-sm font-medium text-slate-700">启用</span>
              </label>
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
                      description: form.description || null,
                      isActive: form.isActive,
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

      {/* Members */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">成员</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              共 {members.length} 个成员（用户或角色）
            </p>
          </div>
          <Button
            className="rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={14} /> 添加成员
          </Button>
        </div>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="p-12 text-center">
              <UsersRound size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">还没有成员</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left w-[100px]">类型</th>
                  <th className="px-6 py-3 text-left">名称 / ID</th>
                  <th className="px-6 py-3 text-right">加入时间</th>
                  <th className="px-6 py-3 text-right w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onRemove={() => {
                      if (confirm('确认移除该成员？')) removeMemberMut.mutate(m.id);
                    }}
                    removing={removeMemberMut.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AddMemberDialog
        groupId={id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}

function MemberRow({
  member, onRemove, removing,
}: { member: PublicGroupMember; onRemove: () => void; removing: boolean }) {
  // Best-effort label fetch via cached lists.
  const { data: users } = useQuery<UserRow[]>({
    queryKey: ['admin-users-cache'],
    queryFn: async () => {
      const r = await adminApi.listUsers();
      return Array.isArray(r) ? r : (r?.data ?? []);
    },
    staleTime: 60_000,
    enabled: !!member.userId,
  });
  const { data: roles } = useQuery<RoleRow[]>({
    queryKey: ['admin-roles-cache'],
    queryFn: () => adminApi.listRoles(),
    staleTime: 60_000,
    enabled: !!member.roleId,
  });

  const isUser = !!member.userId;
  const userMatch = users?.find((u) => u.id === member.userId);
  const roleMatch = roles?.find((r) => r.id === member.roleId);

  return (
    <tr className="hover:bg-slate-50/40 transition-colors">
      <td className="px-6 py-4">
        {isUser ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2 h-5 rounded-full bg-blue-50 text-blue-700">
            <User size={11} /> 用户
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2 h-5 rounded-full bg-purple-50 text-purple-700">
            <Briefcase size={11} /> 角色
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        {isUser ? (
          <div>
            <div className="text-sm font-bold text-ink">
              {userMatch?.displayName ?? '（未知用户）'}
            </div>
            <div className="text-xs font-mono text-slate-400">{member.userId}</div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-bold text-ink">
              {roleMatch?.name ?? '（未知角色）'}
            </div>
            <div className="text-xs font-mono text-slate-400">{member.roleId}</div>
          </div>
        )}
      </td>
      <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
        {fmtRelative(member.createdAt)}
      </td>
      <td className="px-6 py-4 text-right">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-xl gap-1 font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={onRemove}
          disabled={removing}
        >
          <Trash2 size={12} /> 移除
        </Button>
      </td>
    </tr>
  );
}

function AddMemberDialog({
  groupId, open, onOpenChange,
}: { groupId: string; open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'user' | 'role'>('user');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery<UserRow[]>({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const r = await adminApi.listUsers();
      return Array.isArray(r) ? r : (r?.data ?? []);
    },
    enabled: open && tab === 'user',
  });
  const { data: roles } = useQuery<RoleRow[]>({
    queryKey: ['admin-roles-list'],
    queryFn: () => adminApi.listRoles(),
    enabled: open && tab === 'role',
  });

  const addMut = useMutation({
    mutationFn: (d: { userId?: string | null; roleId?: string | null }) =>
      publicGroupsApi.addMember(groupId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-group', groupId] });
      setSearch('');
      setError(null);
      onOpenChange(false);
    },
    onError: (e: { response?: { data?: { message?: string } }; message: string }) => {
      setError(e.response?.data?.message ?? e.message);
    },
  });

  const lower = search.trim().toLowerCase();
  const filteredUsers = (users ?? []).filter((u) => {
    if (!lower) return true;
    return (
      u.displayName?.toLowerCase().includes(lower) ||
      u.email?.toLowerCase().includes(lower)
    );
  }).slice(0, 50);
  const filteredRoles = (roles ?? []).filter((r) => {
    if (!lower) return true;
    return r.name?.toLowerCase().includes(lower);
  }).slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">添加成员</DialogTitle>
          <DialogDescription>
            选择一个用户或一个角色加入群组。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            className={
              tab === 'user'
                ? 'px-3 py-1 text-xs font-black rounded-lg bg-white text-ink shadow-sm'
                : 'px-3 py-1 text-xs font-black rounded-lg text-slate-500'
            }
            onClick={() => setTab('user')}
          >
            <User size={11} className="inline mr-1" /> 用户
          </button>
          <button
            type="button"
            className={
              tab === 'role'
                ? 'px-3 py-1 text-xs font-black rounded-lg bg-white text-ink shadow-sm'
                : 'px-3 py-1 text-xs font-black rounded-lg text-slate-500'
            }
            onClick={() => setTab('role')}
          >
            <Briefcase size={11} className="inline mr-1" /> 角色
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'user' ? '搜索用户姓名 / 邮箱' : '搜索角色名'}
            className="h-10 pl-9 rounded-xl"
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl">
          {tab === 'user' ? (
            filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-bold">
                没有匹配的用户
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <li
                    key={u.id}
                    className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-2"
                    onClick={() => addMut.mutate({ userId: u.id })}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink truncate">{u.displayName}</div>
                      {u.email && (
                        <div className="text-xs text-slate-400 truncate">{u.email}</div>
                      )}
                    </div>
                    <Check size={14} className="text-slate-300 shrink-0" />
                  </li>
                ))}
              </ul>
            )
          ) : (
            filteredRoles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-bold">
                没有匹配的角色
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredRoles.map((r) => (
                  <li
                    key={r.id}
                    className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-2"
                    onClick={() => addMut.mutate({ roleId: r.id })}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink truncate">{r.name}</div>
                      {r.description && (
                        <div className="text-xs text-slate-400 truncate">{r.description}</div>
                      )}
                    </div>
                    <Check size={14} className="text-slate-300 shrink-0" />
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
        {error && (
          <div className="text-xs font-bold text-red-600 bg-red-50 rounded-lg p-2">{error}</div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
