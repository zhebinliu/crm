'use client';
// ─── /admin/territories/[id] ────────────────────────────────────────────
// Territory detail (Wave 19f / 20f) — header + 4 tabs:
//   概览 | 成员 | 账号 | 分配规则
// Members and rules are managed inline; account picker uses /accounts.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { territoryApi, accountsApi, adminApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft, Loader2, MapPin, Users as UsersIcon, Building2, Sparkles,
  Plus, Trash2, AlertCircle, Pencil, Save, X, Shield, Search,
} from 'lucide-react';

interface TerritoryDetail {
  id: string;
  apiName: string;
  label: string;
  description: string | null;
  parentId: string | null;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    id: string;
    userId: string;
    territoryId: string;
    roleInTerritory: string;
    isPrimary: boolean;
    user: { id: string; displayName: string | null; email: string | null };
  }>;
  rules: Array<{
    id: string;
    name: string;
    description: string | null;
    matchType: 'all' | 'any';
    priority: number;
    isActive: boolean;
    conditions: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface TerritoryRow {
  id: string;
  apiName: string;
  label: string;
  parentId: string | null;
  type: string;
  isActive: boolean;
  _count?: { members: number; accounts: number; rules: number; children: number };
}

interface AccountTerritoryRow {
  id: string;
  accountId: string;
  territoryId: string;
  source: string;
  isPrimary: boolean;
  createdAt: string;
  account?: { id: string; name: string };
}

interface UserRow {
  id: string;
  displayName: string | null;
  email: string | null;
}

interface AccountRow {
  id: string;
  name: string;
}

interface Condition {
  field: string;
  op: string;
  value: string | string[] | number;
}

interface AssignmentRule {
  id?: string;
  name: string;
  description?: string | null;
  matchType: 'all' | 'any';
  priority: number;
  isActive: boolean;
  conditions: Condition[];
}

const TYPE_ZH: Record<string, string> = {
  geographic: '地理',
  industry: '行业',
  named_account: '指定账号',
  other: '其他',
};

const ROLE_ZH: Record<string, string> = {
  owner: '负责人',
  rep: '业务员',
  manager: '主管',
  view_only: '只读',
};

const SOURCE_ZH: Record<string, string> = {
  auto: '自动',
  manual: '手动',
  inherited: '继承',
};

const FIELD_OPTIONS = [
  { value: 'billingCountry', label: 'billingCountry (账单国家)' },
  { value: 'billingState', label: 'billingState (账单省/州)' },
  { value: 'billingCity', label: 'billingCity (账单城市)' },
  { value: 'billingPostalCode', label: 'billingPostalCode (邮编)' },
  { value: 'industry', label: 'industry (行业)' },
  { value: 'annualRevenue', label: 'annualRevenue (年收入)' },
  { value: 'employees', label: 'employees (员工数)' },
  { value: 'type', label: 'type (类型)' },
  { value: 'name', label: 'name (账号名)' },
];

const OP_OPTIONS = [
  { value: '=', label: '= (等于)' },
  { value: '!=', label: '!= (不等于)' },
  { value: 'in', label: 'in (在列表)' },
  { value: 'not_in', label: 'not_in (不在列表)' },
  { value: '>=', label: '>= (大于等于)' },
  { value: '<=', label: '<= (小于等于)' },
  { value: 'contains', label: 'contains (包含)' },
  { value: 'starts_with', label: 'starts_with (开头是)' },
];

const MULTI_VALUE_OPS = new Set(['in', 'not_in']);

export default function TerritoryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, error } = useQuery<TerritoryDetail>({
    queryKey: ['territory', id],
    queryFn: () => territoryApi.get(id),
    enabled: !!id,
  });

  const { data: allTerritories } = useQuery<TerritoryRow[]>({
    queryKey: ['territories'],
    queryFn: () => territoryApi.list(),
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: () => territoryApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territories'] });
      router.push('/admin/territories');
    },
  });

  const parent = useMemo(() => {
    if (!data?.parentId || !allTerritories) return null;
    return allTerritories.find((t) => t.id === data.parentId) ?? null;
  }, [data, allTerritories]);

  const children = useMemo(() => {
    if (!data || !allTerritories) return [];
    return allTerritories.filter((t) => t.parentId === data.id);
  }, [data, allTerritories]);

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
        <AlertCircle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">
          加载失败：{(error as Error)?.message ?? '未找到领地'}
        </p>
        <Link href="/admin/territories" className="text-xs text-slate-500 underline mt-3 inline-block">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back */}
      <Link
        href="/admin/territories"
        className="text-xs font-bold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> 返回领地树
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shrink-0">
              <MapPin size={20} />
            </div>
            <span className="truncate">{data.label}</span>
            <span
              className={cn(
                'text-[11px] font-black px-2 h-5 rounded-full inline-flex items-center',
                data.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
              )}
            >
              {data.isActive ? '启用' : '停用'}
            </span>
          </h1>
          <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500 flex-wrap">
            <span className="font-mono">{data.apiName}</span>
            <span>·</span>
            <span>类型：{TYPE_ZH[data.type] ?? data.type}</span>
            <span>·</span>
            <span>
              父领地：{parent ? (
                <Link
                  href={`/admin/territories/${parent.id}`}
                  className="text-ink hover:underline"
                >
                  {parent.label}
                </Link>
              ) : '(顶级)'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl font-bold gap-2"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={14} /> 编辑
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl font-bold gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} /> 删除
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100 rounded-xl h-10 p-1">
          <TabsTrigger value="overview" className="rounded-lg font-bold gap-1.5">
            <Sparkles size={13} /> 概览
          </TabsTrigger>
          <TabsTrigger value="members" className="rounded-lg font-bold gap-1.5">
            <UsersIcon size={13} /> 成员 ({data.members.length})
          </TabsTrigger>
          <TabsTrigger value="accounts" className="rounded-lg font-bold gap-1.5">
            <Building2 size={13} /> 账号
          </TabsTrigger>
          <TabsTrigger value="rules" className="rounded-lg font-bold gap-1.5">
            <Shield size={13} /> 分配规则 ({data.rules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={data} children={children} />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab territory={data} />
        </TabsContent>

        <TabsContent value="accounts">
          <AccountsTab territoryId={data.id} />
        </TabsContent>

        <TabsContent value="rules">
          <RulesTab territoryId={data.id} rules={data.rules} />
        </TabsContent>
      </Tabs>

      <EditTerritoryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        territory={data}
        all={allTerritories ?? []}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              删除领地
            </DialogTitle>
            <DialogDescription>
              确认删除领地 <strong>{data.label}</strong>？所有成员、账号分配、规则都会一并删除；子领地的父领地会被设为空。该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: 概览 ──────────────────────────────────────────────────────────

function OverviewTab({
  data, children,
}: {
  data: TerritoryDetail;
  children: TerritoryRow[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">描述</h3>
          <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
            {data.description || <span className="text-slate-300">(无)</span>}
          </p>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-400">
            <div>创建于 {fmtDate(data.createdAt, 'YYYY-MM-DD HH:mm')}</div>
            <div>更新于 {fmtDate(data.updatedAt, 'YYYY-MM-DD HH:mm')}</div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
            子领地 ({children.length})
          </h3>
          {children.length === 0 ? (
            <p className="text-sm text-slate-300 font-medium">(无子领地)</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {children.map((c) => (
                <li key={c.id} className="py-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      c.isActive ? 'bg-emerald-500' : 'bg-slate-300',
                    )}
                  />
                  <Link
                    href={`/admin/territories/${c.id}`}
                    className="text-sm font-bold text-ink hover:underline truncate"
                  >
                    {c.label}
                  </Link>
                  <span className="text-[11px] font-mono text-slate-400 truncate">{c.apiName}</span>
                  <span className="ml-auto text-[10px] font-bold px-1.5 h-4 rounded-full bg-slate-100 text-slate-600 inline-flex items-center">
                    {TYPE_ZH[c.type] ?? c.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: 成员 ──────────────────────────────────────────────────────────

function MembersTab({ territory }: { territory: TerritoryDetail }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (userId: string) => territoryApi.unassignUser(territory.id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territory', territory.id] }),
  });

  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">成员（UserTerritory）</h3>
          <Button
            className="h-9 rounded-xl font-bold gap-1.5 bg-ink hover:bg-slate-800 text-white"
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={13} /> 添加成员
          </Button>
        </div>
        {territory.members.length === 0 ? (
          <div className="p-12 text-center">
            <UsersIcon size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm font-bold text-slate-400">暂无成员</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">用户</th>
                <th className="px-6 py-3 text-left">邮箱</th>
                <th className="px-6 py-3 text-left">角色</th>
                <th className="px-6 py-3 text-center">主要</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {territory.members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3 text-sm font-bold text-ink">
                    {m.user.displayName ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-slate-600">
                    {m.user.email ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span className="inline-flex items-center px-2 h-5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black">
                      {ROLE_ZH[m.roleInTerritory] ?? m.roleInTerritory}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {m.isPrimary && (
                      <span className="inline-flex items-center px-2 h-5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-black">
                        主要
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => remove.mutate(m.userId)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={12} /> 移除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <UserPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        territoryId={territory.id}
      />
    </Card>
  );
}

function UserPickerDialog({
  open, onOpenChange, territoryId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  territoryId: string;
}) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState('rep');
  const [isPrimary, setIsPrimary] = useState(false);

  const { data, isLoading } = useQuery<{ data: UserRow[] } | UserRow[]>({
    queryKey: ['admin-users-for-picker'],
    queryFn: () => adminApi.listUsers({ take: 200 }),
    enabled: open,
  });
  const users: UserRow[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Array.isArray((data as { data: UserRow[] }).data) ? (data as { data: UserRow[] }).data : [];
  }, [data]);

  const assign = useMutation({
    mutationFn: () =>
      territoryApi.assignUser(territoryId, {
        userId: selectedUserId,
        roleInTerritory: role,
        isPrimary,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territory', territoryId] });
      setSelectedUserId('');
      setRole('rep');
      setIsPrimary(false);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">添加成员</DialogTitle>
          <DialogDescription>从用户列表中选择一位用户加入领地。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">用户</label>
            {isLoading ? (
              <div className="h-9 inline-flex items-center text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin mr-1" /> 加载中…
              </div>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
              >
                <option value="">— 选择用户 —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? '(未命名)'} · {u.email ?? ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
            >
              <option value="owner">负责人 (owner)</option>
              <option value="rep">业务员 (rep)</option>
              <option value="manager">主管 (manager)</option>
              <option value="view_only">只读 (view_only)</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            主要领地（设置后会自动取消该用户在其他领地的主要标记）
          </label>
          {assign.error && (
            <p className="text-xs font-bold text-red-500">{(assign.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            onClick={() => assign.mutate()}
            disabled={!selectedUserId || assign.isPending}
          >
            {assign.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: 账号 ──────────────────────────────────────────────────────────

function AccountsTab({ territoryId }: { territoryId: string }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fetch accounts assigned to this territory by filtering the accounts API.
  // Most installs expose `territoryId` as a filter; if not, we fall back to
  // listing all accounts and filtering client-side.
  const { data, isLoading, error } = useQuery<{ data: AccountWithTerritories[] } | AccountWithTerritories[]>({
    queryKey: ['accounts-with-territories', territoryId],
    queryFn: () => accountsApi.list({ territoryId, take: 500 }),
    staleTime: 10_000,
  });

  type Row = { link: AccountTerritoryRow; account: { id: string; name: string } };
  const list = useMemo<Row[]>(() => {
    if (!data) return [];
    const arr: AccountWithTerritories[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { data: AccountWithTerritories[] }).data)
        ? (data as { data: AccountWithTerritories[] }).data
        : [];
    // Client-side narrow: keep accounts whose territories include this id, OR
    // keep the original list if the rows don't carry territories at all.
    const filtered: Row[] = arr
      .map((a): Row | null => {
        const link = a.territories?.find((t) => t.territoryId === territoryId);
        return link
          ? { link, account: { id: a.id, name: a.name } }
          : null;
      })
      .filter((x): x is Row => x !== null);
    if (filtered.length === 0 && arr.length > 0 && !arr[0].territories) {
      // Backend didn't return territory join — show plain accounts that came back
      return arr.map<Row>((a) => ({
        link: {
          id: `${a.id}:${territoryId}`,
          accountId: a.id,
          territoryId,
          source: 'manual',
          isPrimary: false,
          createdAt: a.createdAt ?? new Date().toISOString(),
        },
        account: { id: a.id, name: a.name },
      }));
    }
    return filtered;
  }, [data, territoryId]);

  const remove = useMutation({
    mutationFn: (accountId: string) => territoryApi.unassignAccount(territoryId, accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts-with-territories', territoryId] });
      qc.invalidateQueries({ queryKey: ['territories'] });
    },
  });

  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">账号（AccountTerritory）</h3>
          <Button
            className="h-9 rounded-xl font-bold gap-1.5 bg-ink hover:bg-slate-800 text-white"
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={13} /> 手动分配账号
          </Button>
        </div>
        {isLoading ? (
          <div className="p-10 text-center">
            <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-red-500">加载失败：{(error as Error).message}</p>
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm font-bold text-slate-400">该领地下暂无账号</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">账号名</th>
                <th className="px-6 py-3 text-left">来源</th>
                <th className="px-6 py-3 text-center">主要</th>
                <th className="px-6 py-3 text-left">分配时间</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((row) => (
                <tr key={row.link.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3 text-sm font-bold text-ink truncate">{row.account.name}</td>
                  <td className="px-6 py-3 text-sm">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 h-5 rounded-full text-[11px] font-black',
                        row.link.source === 'manual'
                          ? 'bg-violet-50 text-violet-700'
                          : row.link.source === 'inherited'
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {SOURCE_ZH[row.link.source] ?? row.link.source}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {row.link.isPrimary && (
                      <span className="inline-flex items-center px-2 h-5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-black">
                        主要
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-xs font-bold text-slate-400">
                    {fmtDate(row.link.createdAt, 'YYYY-MM-DD HH:mm')}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => remove.mutate(row.account.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={12} /> 移除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <AccountPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        territoryId={territoryId}
      />
    </Card>
  );
}

interface AccountWithTerritories {
  id: string;
  name: string;
  createdAt?: string;
  territories?: AccountTerritoryRow[];
}

function AccountPickerDialog({
  open, onOpenChange, territoryId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  territoryId: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const { data, isLoading } = useQuery<{ data: AccountRow[] } | AccountRow[]>({
    queryKey: ['accounts-search', search],
    queryFn: () => accountsApi.list({ search: search || undefined, take: 50 }),
    enabled: open,
  });
  const accounts: AccountRow[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Array.isArray((data as { data: AccountRow[] }).data) ? (data as { data: AccountRow[] }).data : [];
  }, [data]);

  const assign = useMutation({
    mutationFn: () =>
      territoryApi.assignAccount(territoryId, selectedId, { isPrimary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts-with-territories', territoryId] });
      qc.invalidateQueries({ queryKey: ['territories'] });
      setSelectedId('');
      setSearch('');
      setIsPrimary(false);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">手动分配账号</DialogTitle>
          <DialogDescription>
            手动分配（source=manual）会被规则引擎保留，不会被自动覆盖。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索账号名"
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <div className="max-h-[40vh] overflow-y-auto border border-slate-100 rounded-xl divide-y">
            {isLoading ? (
              <div className="p-6 text-center">
                <Loader2 size={16} className="animate-spin mx-auto text-slate-300" />
              </div>
            ) : accounts.length === 0 ? (
              <p className="p-6 text-center text-sm font-bold text-slate-400">未找到账号</p>
            ) : (
              accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors',
                    selectedId === a.id && 'bg-blue-50 hover:bg-blue-50',
                  )}
                >
                  <span className="text-sm font-bold text-ink">{a.name}</span>
                  <span className="ml-2 text-[10px] font-mono text-slate-400">{a.id.slice(0, 8)}</span>
                </button>
              ))
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            将该领地设为账号的主要领地
          </label>
          {assign.error && (
            <p className="text-xs font-bold text-red-500">{(assign.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            onClick={() => assign.mutate()}
            disabled={!selectedId || assign.isPending}
          >
            {assign.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            分配
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: 分配规则 ───────────────────────────────────────────────────────

function RulesTab({
  territoryId, rules,
}: {
  territoryId: string;
  rules: TerritoryDetail['rules'];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AssignmentRule | null>(null);

  const remove = useMutation({
    mutationFn: (ruleId: string) => territoryApi.deleteRule(territoryId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territory', territoryId] }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      territoryApi.updateRule(territoryId, ruleId, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territory', territoryId] }),
  });

  function startNew() {
    setEditing({
      name: '',
      description: '',
      matchType: 'all',
      priority: 100,
      isActive: true,
      conditions: [{ field: 'billingCountry', op: '=', value: '' }],
    });
  }

  function startEdit(r: TerritoryDetail['rules'][number]) {
    let conds: Condition[] = [];
    try {
      const raw = r.conditions;
      if (Array.isArray(raw)) {
        conds = raw as Condition[];
      } else if (typeof raw === 'string') {
        conds = JSON.parse(raw) as Condition[];
      }
    } catch {
      conds = [];
    }
    setEditing({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      matchType: r.matchType,
      priority: r.priority,
      isActive: r.isActive,
      conditions: conds.length > 0 ? conds : [{ field: 'billingCountry', op: '=', value: '' }],
    });
  }

  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-center justify-between">
          <h3 className="text-sm font-black text-ink">分配规则（TerritoryAssignmentRule）</h3>
          <Button
            className="h-9 rounded-xl font-bold gap-1.5 bg-ink hover:bg-slate-800 text-white"
            onClick={startNew}
          >
            <Plus size={13} /> 新建规则
          </Button>
        </div>
        {rules.length === 0 ? (
          <div className="p-12 text-center">
            <Shield size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm font-bold text-slate-400">尚未配置规则</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rules.map((r) => (
              <li key={r.id} className="px-6 py-4 hover:bg-slate-50/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-ink truncate">{r.name}</span>
                      <span className="inline-flex items-center px-1.5 h-4 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black">
                        优先级 {r.priority}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 h-4 rounded-full text-[10px] font-black',
                          r.matchType === 'all'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-violet-50 text-violet-700',
                        )}
                      >
                        匹配 {r.matchType === 'all' ? '全部' : '任一'}
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs font-medium text-slate-500 mt-1">{r.description}</p>
                    )}
                    <pre className="mt-2 text-[10px] font-mono bg-slate-50 rounded-lg px-2 py-1.5 overflow-x-auto text-slate-600 max-h-24">
                      {JSON.stringify(r.conditions, null, 0)}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={r.isActive}
                        onChange={(e) =>
                          toggleActive.mutate({ ruleId: r.id, isActive: e.target.checked })
                        }
                        disabled={toggleActive.isPending}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      启用
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1"
                      onClick={() => startEdit(r)}
                    >
                      <Pencil size={11} /> 编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && (
        <RuleEditDialog
          territoryId={territoryId}
          rule={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function RuleEditDialog({
  territoryId, rule, onClose,
}: {
  territoryId: string;
  rule: AssignmentRule;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AssignmentRule>(rule);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name,
        description: draft.description ?? null,
        matchType: draft.matchType,
        priority: draft.priority,
        isActive: draft.isActive,
        conditions: draft.conditions.map((c) => ({
          field: c.field,
          op: c.op,
          value: MULTI_VALUE_OPS.has(c.op)
            ? (typeof c.value === 'string'
                ? c.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
                : c.value)
            : c.value,
        })),
      };
      if (draft.id) {
        return territoryApi.updateRule(territoryId, draft.id, payload);
      }
      return territoryApi.createRule(territoryId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territory', territoryId] });
      onClose();
    },
  });

  function updateCondition(idx: number, patch: Partial<Condition>) {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function addCondition() {
    setDraft((d) => ({
      ...d,
      conditions: [...d.conditions, { field: 'billingCountry', op: '=', value: '' }],
    }));
  }

  function removeCondition(idx: number) {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.filter((_, i) => i !== idx),
    }));
  }

  return (
    <Dialog open onOpenChange={(b) => { if (!b) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            {draft.id ? <Pencil size={18} /> : <Plus size={18} />}
            {draft.id ? '编辑规则' : '新建规则'}
          </DialogTitle>
          <DialogDescription>
            规则用于自动将账号分配到该领地。条件匹配时，引擎会创建一条 source=auto 的 AccountTerritory。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">名称</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 rounded-lg"
                placeholder="美国大客户"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">匹配方式</label>
              <select
                value={draft.matchType}
                onChange={(e) => setDraft({ ...draft, matchType: e.target.value as 'all' | 'any' })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
              >
                <option value="all">全部 (AND)</option>
                <option value="any">任一 (OR)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">优先级</label>
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                className="h-9 rounded-lg"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">描述</label>
              <textarea
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full font-medium"
              />
            </div>
            <label className="col-span-2 inline-flex items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              启用规则
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">条件</h4>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg gap-1"
                onClick={addCondition}
              >
                <Plus size={12} /> 添加条件
              </Button>
            </div>
            <div className="space-y-2">
              {draft.conditions.map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-start p-2 bg-slate-50 rounded-lg"
                >
                  <select
                    value={c.field}
                    onChange={(e) => updateCondition(idx, { field: e.target.value })}
                    className="col-span-4 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => updateCondition(idx, { op: e.target.value })}
                    className="col-span-3 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium"
                  >
                    {OP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {MULTI_VALUE_OPS.has(c.op) ? (
                    <textarea
                      value={Array.isArray(c.value) ? c.value.join('\n') : String(c.value ?? '')}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      placeholder="每行一个值"
                      rows={2}
                      className="col-span-4 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium"
                    />
                  ) : (
                    <Input
                      value={String(c.value ?? '')}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      placeholder="值"
                      className="col-span-4 h-9 rounded-lg text-xs"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="col-span-1 h-9 rounded-lg p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => removeCondition(idx)}
                    disabled={draft.conditions.length <= 1}
                    title="删除"
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {save.error && (
            <p className="text-xs font-bold text-red-500">{(save.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            onClick={() => save.mutate()}
            disabled={save.isPending || !draft.name.trim()}
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit territory dialog ──────────────────────────────────────────────

function EditTerritoryDialog({
  open, onOpenChange, territory, all,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  territory: TerritoryDetail;
  all: TerritoryRow[];
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(territory.label);
  const [description, setDescription] = useState(territory.description ?? '');
  const [parentId, setParentId] = useState(territory.parentId ?? '');
  const [type, setType] = useState(territory.type);
  const [isActive, setIsActive] = useState(territory.isActive);

  // Reset when reopening for the same territory
  useMemo(() => {
    if (open) {
      setLabel(territory.label);
      setDescription(territory.description ?? '');
      setParentId(territory.parentId ?? '');
      setType(territory.type);
      setIsActive(territory.isActive);
    }
  }, [open, territory]);

  const update = useMutation({
    mutationFn: () =>
      territoryApi.update(territory.id, {
        label,
        description: description || null,
        parentId: parentId || null,
        type,
        isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territory', territory.id] });
      qc.invalidateQueries({ queryKey: ['territories'] });
      onOpenChange(false);
    },
  });

  const candidates = all.filter((t) => t.id !== territory.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Pencil size={18} /> 编辑领地
          </DialogTitle>
          <DialogDescription>apiName 不可修改。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">名称</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">apiName</label>
            <Input value={territory.apiName} disabled className="h-9 rounded-lg font-mono bg-slate-50" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
            >
              <option value="geographic">地理</option>
              <option value="industry">行业</option>
              <option value="named_account">指定账号</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">父领地</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
            >
              <option value="">(无 — 顶级)</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>{t.label} ({t.apiName})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full font-medium"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            启用
          </label>
          {update.error && (
            <p className="text-xs font-bold text-red-500">{(update.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            onClick={() => update.mutate()}
            disabled={update.isPending || !label.trim()}
          >
            {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
