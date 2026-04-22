'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
  lead?: any;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  firstName: '', lastName: '', company: '', email: '', phone: '',
  status: 'new', rating: '', source: '', annualRevenue: '', industry: '', description: '',
};

export function LeadFormModal({ open, onClose, lead, onSuccess }: LeadFormModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(lead ? {
        firstName: lead.firstName ?? '',
        lastName: lead.lastName ?? '',
        company: lead.company ?? '',
        email: lead.email ?? '',
        phone: lead.phone ?? '',
        status: lead.status ?? 'new',
        rating: lead.rating ?? '',
        source: lead.source ?? '',
        annualRevenue: lead.annualRevenue != null ? String(lead.annualRevenue) : '',
        industry: lead.industry ?? '',
        description: lead.description ?? '',
      } : { ...EMPTY_FORM });
    }
  }, [open, lead]);

  const mutation = useMutation({
    mutationFn: (d: typeof form) =>
      lead ? leadsApi.update(lead.id, d) : leadsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      if (lead) qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error?.message ?? '操作失败，请重试');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lastName || !form.company) {
      setError('姓氏和公司为必填项');
      return;
    }
    mutation.mutate(form);
  }

  const f = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{lead ? '编辑线索' : '新建线索'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>名</Label>
              <Input {...f('firstName')} placeholder="名" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>姓 <span className="text-red-500">*</span></Label>
              <Input {...f('lastName')} placeholder="姓" className="rounded-xl" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>公司 <span className="text-red-500">*</span></Label>
            <Input {...f('company')} placeholder="所属公司" className="rounded-xl" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input {...f('email')} type="email" placeholder="email@example.com" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>电话</Label>
              <Input {...f('phone')} placeholder="手机号码" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['new','新线索'],['working','跟进中'],['qualified','已资质'],['unqualified','未资质'],['nurturing','培育中']].map(([v,l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>评级</Label>
              <Select value={form.rating} onValueChange={(v) => setForm(p => ({ ...p, rating: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="选择评级" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">🔥 热</SelectItem>
                  <SelectItem value="warm">☀️ 暖</SelectItem>
                  <SelectItem value="cold">❄️ 冷</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>来源</Label>
              <Input {...f('source')} placeholder="线索来源" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>行业</Label>
              <Input {...f('industry')} placeholder="所属行业" className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>年收入</Label>
            <Input {...f('annualRevenue')} type="number" placeholder="预估年收入（元）" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea {...f('description')} placeholder="线索描述或备注" className="rounded-xl resize-none" rows={3} />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>取消</Button>
            <Button type="submit" className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中…' : (lead ? '保存修改' : '创建线索')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
