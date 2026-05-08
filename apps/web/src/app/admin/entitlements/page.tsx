'use client';
// /admin/entitlements — 服务承诺 admin (Wave 20h)

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entitlementApi, slaApi, accountsApi, contactsApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, Save } from 'lucide-react';

interface Entitlement {
  id: string;
  accountId: string | null;
  contactId: string | null;
  slaPolicyId: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'expired' | 'cancelled' | string;
  tier: string | null;
  account?: { name: string } | null;
  contact?: { firstName: string | null; lastName: string | null } | null;
  slaPolicy?: { label: string; apiName: string } | null;
}

interface SlaPolicyOpt {
  id: string;
  label: string;
  apiName: string;
}

interface FormState {
  id?: string;
  party: 'account' | 'contact';
  accountId: string;
  accountLabel: string;
  contactId: string;
  contactLabel: string;
  slaPolicyId: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'expired' | 'cancelled';
  tier: string;
}

function emptyForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  const oneYearLater = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  return {
    party: 'account',
    accountId: '',
    accountLabel: '',
    contactId: '',
    contactLabel: '',
    slaPolicyId: '',
    startsAt: today,
    endsAt: oneYearLater,
    status: 'active',
    tier: 'standard',
  };
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-50 text-rose-700',
};

export default function EntitlementsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [mode, setMode] = useState<'create' | 'edit'>('create');

  const listQ = useQuery<Entitlement[] | { data: Entitlement[] }>({
    queryKey: ['entitlements'],
    queryFn: () => entitlementApi.list(),
  });

  const policiesQ = useQuery<SlaPolicyOpt[] | { data: SlaPolicyOpt[] }>({
    queryKey: ['sla-policies'],
    queryFn: () => slaApi.listPolicies(),
  });

  const items = useMemo(() => {
    const raw = listQ.data;
    return Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  }, [listQ.data]) as Entitlement[];

  const policies = useMemo(() => {
    const raw = policiesQ.data;
    return Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  }, [policiesQ.data]) as SlaPolicyOpt[];

  const createMut = useMutation({
    mutationFn: (d: unknown) => entitlementApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entitlements'] });
      setOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: unknown }) => entitlementApi.update(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entitlements'] });
      setOpen(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => entitlementApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entitlements'] }),
  });

  function startCreate() {
    setMode('create');
    setForm({ ...emptyForm(), slaPolicyId: policies[0]?.id ?? '' });
    setOpen(true);
  }

  function startEdit(e: Entitlement) {
    setMode('edit');
    setForm({
      id: e.id,
      party: e.accountId ? 'account' : 'contact',
      accountId: e.accountId ?? '',
      accountLabel: e.account?.name ?? '',
      contactId: e.contactId ?? '',
      contactLabel: e.contact
        ? [e.contact.firstName, e.contact.lastName].filter(Boolean).join(' ')
        : '',
      slaPolicyId: e.slaPolicyId,
      startsAt: e.startsAt.slice(0, 10),
      endsAt: e.endsAt.slice(0, 10),
      status: (['active', 'expired', 'cancelled'].includes(e.status) ? e.status : 'active') as FormState['status'],
      tier: e.tier ?? '',
    });
    setOpen(true);
  }

  function save() {
    const payload: Record<string, unknown> = {
      slaPolicyId: form.slaPolicyId,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      status: form.status,
      tier: form.tier || undefined,
    };
    if (form.party === 'account') {
      payload.accountId = form.accountId;
      payload.contactId = null;
    } else {
      payload.contactId = form.contactId;
      payload.accountId = null;
    }
    if (mode === 'create') createMut.mutate(payload);
    else if (form.id) updateMut.mutate({ id: form.id, d: payload });
  }

  function partyLabel(e: Entitlement): string {
    if (e.account?.name) return e.account.name;
    if (e.contact) return [e.contact.firstName, e.contact.lastName].filter(Boolean).join(' ') || '—';
    return '—';
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </div>
            服务承诺
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            将 SLA 策略绑定到具体客户或联系人 (Entitlement)
          </p>
        </div>
        <Button
          className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
          onClick={startCreate}
          disabled={policies.length === 0}
        >
          <Plus size={14} /> 新建
        </Button>
      </div>

      {policies.length === 0 && (
        <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-sm font-bold">
          需要先在「SLA 策略」页面创建策略才能添加服务承诺
        </div>
      )}

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-16 text-center">
              <ShieldCheck size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">暂无服务承诺</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">客户 / 联系人</th>
                  <th className="px-6 py-3 text-left">SLA 策略</th>
                  <th className="px-6 py-3 text-left">起止</th>
                  <th className="px-6 py-3 text-center">状态</th>
                  <th className="px-6 py-3 text-left">分层</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-sm font-bold text-ink">{partyLabel(e)}</td>
                    <td className="px-6 py-3 text-sm font-bold text-slate-600">
                      {e.slaPolicy?.label ?? e.slaPolicyId}
                    </td>
                    <td className="px-6 py-3 text-xs font-mono text-slate-500">
                      {fmtDate(e.startsAt, 'YYYY-MM-DD')} → {fmtDate(e.endsAt, 'YYYY-MM-DD')}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={cn(
                        'text-[10px] font-black px-2 py-0.5 rounded-full',
                        STATUS_BADGE[e.status] ?? 'bg-slate-100 text-slate-500',
                      )}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-500">{e.tier ?? '—'}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 rounded-lg font-bold gap-1 text-[11px]"
                          onClick={() => startEdit(e)}
                        >
                          <Pencil size={10} /> 编辑
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 rounded-lg font-bold gap-1 text-[11px] hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => {
                            if (confirm('删除此服务承诺？')) deleteMut.mutate(e.id);
                          }}
                        >
                          <Trash2 size={10} /> 删除
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

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <ShieldCheck size={18} /> {mode === 'create' ? '新建服务承诺' : '编辑服务承诺'}
            </DialogTitle>
            <DialogDescription>选择客户或联系人，并绑定一条 SLA 策略</DialogDescription>
          </DialogHeader>

          {(createMut.error || updateMut.error) && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold">
              保存失败：{((createMut.error ?? updateMut.error) as Error).message}
            </div>
          )}

          <div className="space-y-4">
            {/* Party picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">绑定到</Label>
              <div className="flex gap-1.5">
                {(['account', 'contact'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, party: p })}
                    className={cn(
                      'flex-1 h-10 rounded-xl text-sm font-bold border transition-colors',
                      form.party === p ? 'border-ink bg-ink text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}
                  >
                    {p === 'account' ? '客户' : '联系人'}
                  </button>
                ))}
              </div>
            </div>

            {form.party === 'account' ? (
              <PartyPicker
                kind="account"
                value={form.accountId}
                onChange={(id, label) => setForm({ ...form, accountId: id, accountLabel: label })}
                initialLabel={form.accountLabel}
              />
            ) : (
              <PartyPicker
                kind="contact"
                value={form.contactId}
                onChange={(id, label) => setForm({ ...form, contactId: id, contactLabel: label })}
                initialLabel={form.contactLabel}
              />
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">SLA 策略 *</Label>
              <select
                value={form.slaPolicyId}
                onChange={(e) => setForm({ ...form, slaPolicyId: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold bg-white"
              >
                <option value="">— 请选择 —</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.apiName})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">开始日期 *</Label>
                <Input
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">结束日期 *</Label>
                <Input
                  type="date"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">状态</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold bg-white"
                >
                  <option value="active">active</option>
                  <option value="expired">expired</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">分层 (tier)</Label>
                <Input
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  placeholder="standard / premium / enterprise"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>取消</Button>
            <Button
              className="rounded-xl bg-ink hover:bg-slate-800 text-white gap-1.5"
              onClick={save}
              disabled={
                createMut.isPending || updateMut.isPending ||
                !form.slaPolicyId ||
                (form.party === 'account' ? !form.accountId : !form.contactId)
              }
            >
              <Save size={14} /> 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartyPicker({
  kind, value, onChange, initialLabel,
}: {
  kind: 'account' | 'contact';
  value: string;
  onChange: (id: string, label: string) => void;
  initialLabel: string;
}) {
  const [search, setSearch] = useState(initialLabel);
  const q = useQuery({
    queryKey: ['party-picker', kind, search],
    queryFn: () => kind === 'account'
      ? accountsApi.list({ search, take: 20 })
      : contactsApi.list({ search, take: 20 }),
    staleTime: 10_000,
  });
  const rows = (Array.isArray(q.data?.data) ? q.data.data : Array.isArray(q.data) ? q.data : []) as Array<{
    id: string; name?: string; firstName?: string | null; lastName?: string | null;
  }>;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
        {kind === 'account' ? '客户' : '联系人'} *
      </Label>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="按名称搜索…"
        className="h-10 rounded-xl"
      />
      <div className="border border-slate-100 rounded-xl max-h-44 overflow-y-auto divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="p-3 text-xs text-slate-400 font-bold text-center">未找到</div>
        ) : (
          rows.map((r) => {
            const label = kind === 'account'
              ? (r.name ?? '—')
              : ([r.firstName, r.lastName].filter(Boolean).join(' ') || '—');
            const selected = r.id === value;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onChange(r.id, label)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm font-bold transition-colors',
                  selected ? 'bg-brand/5 text-brand' : 'hover:bg-slate-50 text-ink',
                )}
              >
                {label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
