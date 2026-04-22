'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { contactsApi, accountsApi } from '@/lib/api';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { fmtDate, cn } from '@/lib/utils';
import {
  ArrowLeft, User, Mail, Phone, Briefcase,
  Building2, Calendar, Pencil, Trash2, Activity,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  accountId?: string;
  account?: { id: string; name: string };
  title?: string;
  email?: string;
  phone?: string;
  department?: string;
  description?: string;
  ownerId?: string;
  createdAt: string;
}

interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  accountId: string;
  description: string;
}

// ── ContactFormModal ───────────────────────────────────────────────────────

function ContactFormModal({
  open,
  onClose,
  initial,
  contactId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ContactFormData>;
  contactId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContactFormData>({
    firstName: '', lastName: '', email: '', phone: '',
    title: '', department: '', accountId: '', description: '',
    ...initial,
  });
  const [errors, setErrors] = useState<Partial<ContactFormData>>({});

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-lookup'],
    queryFn: () => accountsApi.list({ take: 100 }),
  });
  const accountOptions: { id: string; name: string }[] = accountsData?.data ?? accountsData ?? [];

  const set = (k: keyof ContactFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const updateMut = useMutation({
    mutationFn: (d: unknown) => contactsApi.update(contactId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      onClose();
    },
  });

  function validate() {
    const e: Partial<ContactFormData> = {};
    if (!form.lastName.trim()) e.lastName = '姓氏不能为空';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    updateMut.mutate({
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim(),
      email: form.email || undefined,
      phone: form.phone || undefined,
      title: form.title || undefined,
      department: form.department || undefined,
      accountId: form.accountId || undefined,
      description: form.description || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-ink">编辑联系人</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">名</Label>
              <Input value={form.firstName} onChange={set('firstName')} placeholder="如：志远" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                姓 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.lastName}
                onChange={set('lastName')}
                placeholder="如：张"
                className={cn('rounded-xl h-10 border-slate-200', errors.lastName && 'border-red-400')}
              />
              {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">邮箱</Label>
              <Input value={form.email} onChange={set('email')} type="email" placeholder="example@corp.com" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">电话</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="如：138-0000-0000" className="rounded-xl h-10 border-slate-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">职位</Label>
              <Input value={form.title} onChange={set('title')} placeholder="如：技术总监" className="rounded-xl h-10 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">部门</Label>
              <Input value={form.department} onChange={set('department')} placeholder="如：研发部" className="rounded-xl h-10 border-slate-200" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">所属客户</Label>
            <Select value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}>
              <SelectTrigger className="rounded-xl h-10 border-slate-200">
                <SelectValue placeholder="选择客户" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">描述</Label>
            <Textarea value={form.description} onChange={set('description')} placeholder="联系人备注..." rows={3} className="rounded-xl border-slate-200 resize-none" />
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
            确定要删除联系人 <span className="font-bold text-ink">「{name}」</span> 吗？此操作无法撤销。
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

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.get(id),
    enabled: !!id,
  });

  const deleteMut = useMutation({
    mutationFn: () => contactsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      router.push('/contacts');
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto flex items-center justify-center h-64 text-slate-400 font-medium">
        加载中…
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto flex flex-col items-center justify-center h-64 gap-4">
        <User size={40} strokeWidth={1.2} className="text-slate-300" />
        <p className="text-slate-400 font-medium">联系人不存在</p>
        <Button variant="ghost" onClick={() => router.push('/contacts')} className="rounded-xl">
          返回联系人列表
        </Button>
      </div>
    );
  }

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        onClick={() => router.push('/contacts')}
        className="rounded-xl h-9 px-3 text-slate-500 hover:text-ink font-semibold -ml-1"
      >
        <ArrowLeft size={16} className="mr-1.5" />
        联系人
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Initials Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-ink font-black text-lg">
            {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">{fullName}</h1>
            {contact.title && (
              <p className="text-slate-500 font-medium mt-0.5">{contact.title}</p>
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
            <User size={14} /> 基本信息
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
                <CardTitle className="text-base font-black text-ink">联系方式</CardTitle>
              </CardHeader>
              <Separator className="bg-slate-50" />
              <CardContent className="px-6 py-5 space-y-5">
                <InfoItem
                  icon={<Mail size={15} />}
                  label="邮箱"
                  value={
                    contact.email ? (
                      <a href={`mailto:${contact.email}`} className="text-brand hover:underline">
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )
                  }
                />
                <InfoItem
                  icon={<Phone size={15} />}
                  label="电话"
                  value={
                    contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="hover:text-brand transition-colors">
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )
                  }
                />
                <InfoItem
                  icon={<Briefcase size={15} />}
                  label="部门"
                  value={contact.department ?? <span className="text-slate-300">—</span>}
                />
                <InfoItem
                  icon={<Building2 size={15} />}
                  label="所属客户"
                  value={
                    contact.account ? (
                      <Link
                        href={`/accounts/${contact.accountId}`}
                        className="text-brand hover:underline font-semibold"
                      >
                        {contact.account.name}
                      </Link>
                    ) : contact.accountId ? (
                      <Link
                        href={`/accounts/${contact.accountId}`}
                        className="text-brand hover:underline font-mono text-xs"
                      >
                        {contact.accountId}
                      </Link>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )
                  }
                />
                <InfoItem
                  icon={<Calendar size={15} />}
                  label="创建时间"
                  value={fmtDate(contact.createdAt, 'YYYY-MM-DD HH:mm')}
                />
              </CardContent>
            </Card>

            {contact.description && (
              <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
                <CardHeader className="px-6 pt-6 pb-4">
                  <CardTitle className="text-base font-black text-ink">描述</CardTitle>
                </CardHeader>
                <Separator className="bg-slate-50" />
                <CardContent className="px-6 py-5">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{contact.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Activity Timeline */}
        <TabsContent value="activities" className="mt-0">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-6">
              <ActivityTimeline relatedToType="contact" relatedToId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {editOpen && (
        <ContactFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          contactId={contact.id}
          initial={{
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email ?? '',
            phone: contact.phone ?? '',
            title: contact.title ?? '',
            department: contact.department ?? '',
            accountId: contact.accountId ?? '',
            description: contact.description ?? '',
          }}
        />
      )}
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
        name={fullName}
      />
    </div>
  );
}
