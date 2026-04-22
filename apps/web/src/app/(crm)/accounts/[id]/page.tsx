'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { accountsApi, contactsApi } from '@/lib/api';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { fmtDate, fmtMoney, cn } from '@/lib/utils';
import {
  ArrowLeft, Building2, Phone, Globe, MapPin,
  Flag, Calendar, Users, Pencil, Trash2, Mail, Activity,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ── Types ──────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  industry?: string;
  phone?: string;
  website?: string;
  annualRevenue?: number | string | null;
  billingCity?: string;
  billingCountry?: string;
  description?: string;
  ownerId?: string;
  createdAt: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  department?: string;
  createdAt: string;
}

interface AccountFormData {
  name: string;
  industry: string;
  phone: string;
  website: string;
  annualRevenue: string;
  billingCity: string;
  billingCountry: string;
  description: string;
}

// ── AccountFormModal ───────────────────────────────────────────────────────

function AccountFormModal({
  open,
  onClose,
  initial,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<AccountFormData>;
  accountId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AccountFormData>({
    name: '', industry: '', phone: '', website: '',
    annualRevenue: '', billingCity: '', billingCountry: '', description: '',
    ...initial,
  });
  const [errors, setErrors] = useState<Partial<AccountFormData>>({});

  const set = (k: keyof AccountFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const updateMut = useMutation({
    mutationFn: (d: unknown) => accountsApi.update(accountId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account', accountId] });
      onClose();
    },
  });

  function validate() {
    const e: Partial<AccountFormData> = {};
    if (!form.name.trim()) e.name = '客户名称不能为空';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    updateMut.mutate({
      name: form.name.trim(),
      industry: form.industry || undefined,
      phone: form.phone || undefined,
      website: form.website || undefined,
      annualRevenue: form.annualRevenue ? Number(form.annualRevenue) : undefined,
      billingCity: form.billingCity || undefined,
      billingCountry: form.billingCountry || undefined,
      description: form.description || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-ink">编辑客户</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              客户名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={set('name')}
              placeholder="请输入客户名称"
              className={cn('rounded-xl h-10 border-slate-200', errors.name && 'border-red-400')}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">行业</Label>
              <Input value={form.industry} onChange={set('industry')} placeholder="如：科技" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">电话</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="如：021-12345678" className="rounded-xl h-10 border-slate-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">网站</Label>
              <Input value={form.website} onChange={set('website')} placeholder="https://" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">年收入</Label>
              <Input value={form.annualRevenue} onChange={set('annualRevenue')} type="number" placeholder="单位：元" className="rounded-xl h-10 border-slate-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">城市</Label>
              <Input value={form.billingCity} onChange={set('billingCity')} placeholder="如：上海" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">国家</Label>
              <Input value={form.billingCountry} onChange={set('billingCountry')} placeholder="如：中国" className="rounded-xl h-10 border-slate-200" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">描述</Label>
            <Textarea value={form.description} onChange={set('description')} placeholder="客户简介或备注..." rows={3} className="rounded-xl border-slate-200 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-10 px-5 font-bold border-slate-200">
              取消
            </Button>
            <Button type="submit" disabled={updateMut.isPending} className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5">
              {updateMut.isPending ? '保存中…' : '保存更改'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm Dialog ──────────────────────────────────────────────────

function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading,
  name,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  name: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-ink">确认删除</DialogTitle>
        </DialogHeader>
        <div className="px-7 py-6 space-y-5">
          <p className="text-sm text-slate-600">
            确定要删除客户 <span className="font-bold text-ink">「{name}」</span> 吗？此操作无法撤销。
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} className="rounded-xl h-10 px-5 font-bold border-slate-200">
              取消
            </Button>
            <Button
              onClick={onConfirm}
              disabled={loading}
              className="rounded-xl h-10 px-5 font-bold bg-red-500 hover:bg-red-600 text-white"
            >
              {loading ? '删除中…' : '确认删除'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Info Item ──────────────────────────────────────────────────────────────

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: account, isLoading } = useQuery<Account>({
    queryKey: ['account', id],
    queryFn: () => accountsApi.get(id),
    enabled: !!id,
  });

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', { accountId: id }],
    queryFn: () => contactsApi.list({ accountId: id }),
    enabled: !!id,
  });

  const contacts: Contact[] = contactsData?.data ?? contactsData ?? [];

  const deleteMut = useMutation({
    mutationFn: () => accountsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      router.push('/accounts');
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto flex items-center justify-center h-64 text-slate-400 font-medium">
        加载中…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto flex flex-col items-center justify-center h-64 gap-4">
        <Building2 size={40} strokeWidth={1.2} className="text-slate-300" />
        <p className="text-slate-400 font-medium">客户不存在</p>
        <Button variant="ghost" onClick={() => router.push('/accounts')} className="rounded-xl">
          返回客户列表
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        onClick={() => router.push('/accounts')}
        className="rounded-xl h-9 px-3 text-slate-500 hover:text-ink font-semibold -ml-1"
      >
        <ArrowLeft size={16} className="mr-1.5" />
        客户
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={26} className="text-brand" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">{account.name}</h1>
            {account.industry && (
              <Badge variant="secondary" className="mt-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-100">
                {account.industry}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="rounded-xl h-10 px-4 font-bold border-slate-200"
          >
            <Pencil size={14} className="mr-1.5" />
            编辑
          </Button>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className="rounded-xl h-10 px-4 font-bold border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} className="mr-1.5" />
            删除
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="bg-slate-100 rounded-2xl p-1 h-11 mb-6">
          <TabsTrigger
            value="info"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Building2 size={14} /> 基本信息
          </TabsTrigger>
          <TabsTrigger
            value="contacts"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Users size={14} /> 相关联系人
            {contacts.length > 0 && (
              <span className="ml-1 bg-brand/10 text-brand text-xs font-black px-1.5 py-0.5 rounded-full">
                {contacts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activities"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Activity size={14} /> 活动记录
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Basic Info */}
        <TabsContent value="info" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
              <CardHeader className="px-6 pt-6 pb-4">
                <CardTitle className="text-base font-black text-ink">基本信息</CardTitle>
              </CardHeader>
              <Separator className="bg-slate-50" />
              <CardContent className="px-6 py-5 space-y-5">
                <InfoItem icon={<Building2 size={15} />} label="行业" value={account.industry ?? <span className="text-slate-300">—</span>} />
                <InfoItem icon={<Phone size={15} />} label="电话" value={account.phone ?? <span className="text-slate-300">—</span>} />
                <InfoItem
                  icon={<Globe size={15} />}
                  label="网站"
                  value={
                    account.website ? (
                      <a
                        href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline truncate block"
                      >
                        {account.website}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )
                  }
                />
                <InfoItem
                  icon={<span className="text-xs font-black">¥</span>}
                  label="年收入"
                  value={<span className="text-brand font-bold">{fmtMoney(account.annualRevenue)}</span>}
                />
                <InfoItem
                  icon={<MapPin size={15} />}
                  label="城市"
                  value={account.billingCity ?? <span className="text-slate-300">—</span>}
                />
                <InfoItem
                  icon={<Flag size={15} />}
                  label="国家"
                  value={account.billingCountry ?? <span className="text-slate-300">—</span>}
                />
                <InfoItem
                  icon={<Calendar size={15} />}
                  label="创建时间"
                  value={fmtDate(account.createdAt, 'YYYY-MM-DD HH:mm')}
                />
              </CardContent>
            </Card>

            {account.description && (
              <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
                <CardHeader className="px-6 pt-6 pb-4">
                  <CardTitle className="text-base font-black text-ink">描述</CardTitle>
                </CardHeader>
                <Separator className="bg-slate-50" />
                <CardContent className="px-6 py-5">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{account.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Related Contacts */}
        <TabsContent value="contacts" className="mt-0">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardHeader className="px-6 pt-6 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-black text-ink flex items-center gap-2">
                <Users size={16} className="text-brand" />
                相关联系人
                {contacts.length > 0 && (
                  <Badge className="ml-1 rounded-lg text-xs font-bold bg-brand/10 text-brand hover:bg-brand/10 border-none">
                    {contacts.length}
                  </Badge>
                )}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                asChild
                className="rounded-xl h-8 px-3 font-bold text-xs border-slate-200"
              >
                <Link href={`/contacts?accountId=${id}`}>查看全部</Link>
              </Button>
            </CardHeader>
            <Separator className="bg-slate-50" />
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 gap-2 text-slate-400">
                  <Users size={28} strokeWidth={1.2} />
                  <p className="text-sm font-medium">暂无相关联系人</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {contacts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contacts/${c.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500 font-bold text-sm group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                        {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-ink group-hover:text-brand transition-colors">
                          {c.firstName} {c.lastName}
                        </p>
                        {c.title && <p className="text-xs text-slate-400 truncate">{c.title}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs text-slate-400 min-w-0">
                        {c.email && (
                          <span className="flex items-center gap-1 truncate max-w-[160px]">
                            <Mail size={11} />
                            {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} />
                            {c.phone}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Activity Timeline */}
        <TabsContent value="activities" className="mt-0">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6">
              <ActivityTimeline relatedToType="account" relatedToId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {editOpen && (
        <AccountFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          accountId={account.id}
          initial={{
            name: account.name,
            industry: account.industry ?? '',
            phone: account.phone ?? '',
            website: account.website ?? '',
            annualRevenue: account.annualRevenue != null ? String(account.annualRevenue) : '',
            billingCity: account.billingCity ?? '',
            billingCountry: account.billingCountry ?? '',
            description: account.description ?? '',
          }}
        />
      )}
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
        name={account.name}
      />
    </div>
  );
}
