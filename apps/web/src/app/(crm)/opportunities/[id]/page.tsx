'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { oppsApi, quotesApi, productsApi } from '@/lib/api';
import { ActivityTimeline } from '@/components/crm/activity-timeline';
import { fmtDate, fmtMoney, stageColor, cn } from '@/lib/utils';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Pencil, FileText, Trash2, Plus,
  Building2, CalendarDays, TrendingUp, Target,
  CheckCircle2, XCircle, Package, Activity, ChevronRight,
  Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  productId: string;
  product?: { name: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Opportunity {
  id: string;
  name: string;
  accountId: string;
  account?: { name: string };
  stage: string;
  amount?: number | string | null;
  closeDate?: string | null;
  probability?: number | null;
  forecastCategory?: string | null;
  isClosed?: boolean;
  isWon?: boolean;
  description?: string | null;
  ownerId?: string;
  createdAt?: string;
  lineItems?: LineItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGES: { value: string; label: string }[] = [
  { value: 'prospecting',       label: '初步接触' },
  { value: 'qualification',     label: '潜在资质' },
  { value: 'needs_analysis',    label: '方案需求' },
  { value: 'value_proposition', label: '价值主张' },
  { value: 'proposal',          label: '正式提案' },
  { value: 'negotiation',       label: '商务谈判' },
  { value: 'closed_won',        label: '已赢单' },
  { value: 'closed_lost',       label: '已丢单' },
];

function stageZh(s: string) {
  return STAGES.find((st) => st.value === s)?.label ?? s;
}

const FORECAST_LABELS: Record<string, string> = {
  pipeline:     '管道',
  best_case:    '乐观预期',
  commit:       '承诺达成',
  closed:       '已结案',
  omitted:      '已排除',
};

// ── EditModal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  opp: Opportunity;
  open: boolean;
  onClose: () => void;
}

function EditModal({ opp, open, onClose }: EditModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: opp.name,
    stage: opp.stage,
    amount: opp.amount != null ? String(opp.amount) : '',
    closeDate: opp.closeDate ? opp.closeDate.slice(0, 10) : '',
    probability: opp.probability != null ? String(opp.probability) : '',
    description: opp.description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => oppsApi.update(opp.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', opp.id] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      onClose();
    },
  });

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '商机名称不能为空';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    mutation.mutate({
      name: form.name.trim(),
      stage: form.stage,
      amount: form.amount ? Number(form.amount) : undefined,
      closeDate: form.closeDate || undefined,
      probability: form.probability ? Number(form.probability) : undefined,
      description: form.description.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4">
          <DialogTitle className="text-2xl font-black text-ink flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
              <Pencil size={16} />
            </span>
            编辑商机
          </DialogTitle>
        </DialogHeader>
        <Separator />
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          <div className="space-y-1.5">
            <Label className="font-bold text-ink text-sm">
              商机名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              className={cn('rounded-xl border-slate-200 h-11', errors.name && 'border-red-400')}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-ink text-sm">阶段</Label>
            <Select value={form.stage} onValueChange={(v) => field('stage', v)}>
              <SelectTrigger className="rounded-xl border-slate-200 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="rounded-lg">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-ink text-sm">金额（元）</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => field('amount', e.target.value)}
                className="rounded-xl border-slate-200 h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-ink text-sm">赢单概率（%）</Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={form.probability}
                onChange={(e) => field('probability', e.target.value)}
                className="rounded-xl border-slate-200 h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-ink text-sm">预计结案日期</Label>
            <Input
              type="date"
              value={form.closeDate}
              onChange={(e) => field('closeDate', e.target.value)}
              className="rounded-xl border-slate-200 h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-ink text-sm">描述</Label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">
              更新失败，请稍后重试
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-slate-200 h-11 px-6 font-bold"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-brand hover:bg-brand-deep text-white h-11 px-8 font-bold shadow-xl shadow-brand/20"
            >
              {mutation.isPending ? '保存中…' : '保存更改'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── AddLineItemModal ──────────────────────────────────────────────────────────

interface AddLineItemModalProps {
  oppId: string;
  open: boolean;
  onClose: () => void;
}

function AddLineItemModal({ oppId, open, onClose }: AddLineItemModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ productId: '', quantity: '1', unitPrice: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: productsData } = useQuery({
    queryKey: ['products-lookup'],
    queryFn: () => productsApi.list({ take: 100 }),
  });
  const productOptions: { id: string; name: string; defaultPrice?: number; isActive?: boolean }[] =
    productsData?.data ?? productsData ?? [];

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => oppsApi.addLineItem(oppId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', oppId] });
      setForm({ productId: '', quantity: '1', unitPrice: '' });
      setErrors({});
      onClose();
    },
  });

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleProductSelect(id: string) {
    const product = productOptions.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      productId: id,
      unitPrice: product?.defaultPrice != null ? String(product.defaultPrice) : f.unitPrice,
    }));
    if (errors.productId) setErrors((e) => { const n = { ...e }; delete n.productId; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.productId.trim()) errs.productId = '请选择产品';
    if (!form.quantity || Number(form.quantity) <= 0) errs.quantity = '数量需大于0';
    if (!form.unitPrice || Number(form.unitPrice) < 0) errs.unitPrice = '单价不能为负数';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    mutation.mutate({
      productId: form.productId.trim(),
      quantity: Number(form.quantity),
      unitPrice: Number(form.unitPrice),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-4">
          <DialogTitle className="text-xl font-black text-ink flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
              <Package size={16} />
            </span>
            添加产品
          </DialogTitle>
        </DialogHeader>
        <Separator />
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-bold text-ink text-sm">
              产品 <span className="text-red-500">*</span>
            </Label>
            <Select value={form.productId} onValueChange={handleProductSelect}>
              <SelectTrigger className={cn('rounded-xl border-slate-200 h-11', errors.productId && 'border-red-400')}>
                <SelectValue placeholder="选择产品…" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {productOptions.filter((p) => p.isActive !== false).map((p) => (
                  <SelectItem key={p.id} value={p.id} className="rounded-lg">
                    <span className="font-medium">{p.name}</span>
                    {p.defaultPrice != null && (
                      <span className="ml-2 text-xs text-slate-400">
                        {fmtMoney(p.defaultPrice)}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.productId && <p className="text-xs text-red-500">{errors.productId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-ink text-sm">数量 <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => field('quantity', e.target.value)}
                className={cn('rounded-xl border-slate-200 h-11', errors.quantity && 'border-red-400')}
              />
              {errors.quantity && <p className="text-xs text-red-500">{errors.quantity}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-ink text-sm">单价（元）<span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={form.unitPrice}
                onChange={(e) => field('unitPrice', e.target.value)}
                className={cn('rounded-xl border-slate-200 h-11', errors.unitPrice && 'border-red-400')}
              />
              {errors.unitPrice && <p className="text-xs text-red-500">{errors.unitPrice}</p>}
            </div>
          </div>

          {form.unitPrice && form.quantity && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500">小计</span>
              <span className="text-base font-black text-ink tabular-nums">
                {fmtMoney(Number(form.quantity) * Number(form.unitPrice))}
              </span>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-xl">
              添加失败，请稍后重试
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-slate-200 h-11 px-6 font-bold"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-brand hover:bg-brand-deep text-white h-11 px-6 font-bold shadow-xl shadow-brand/20"
            >
              {mutation.isPending ? '添加中…' : '添加产品'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab: 详情 ─────────────────────────────────────────────────────────────────

interface OverviewTabProps {
  opp: Opportunity;
  onEdit: () => void;
  onDelete: () => void;
  onCreateQuote: () => void;
  quoteLoading: boolean;
}

function OverviewTab({ opp, onEdit, onDelete, onCreateQuote, quoteLoading }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-indigo-500/5 blur-2xl" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn('border-none font-bold px-3 py-1 text-xs', stageColor(opp.stage))}
                >
                  {stageZh(opp.stage)}
                </Badge>
                {opp.isClosed && (
                  opp.isWon ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full">
                      <CheckCircle2 size={13} /> 已赢单
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1 rounded-full">
                      <XCircle size={13} /> 已丢单
                    </span>
                  )
                )}
              </div>
              <h1 className="text-3xl font-black text-white leading-tight">{opp.name}</h1>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white h-9 px-4 font-bold gap-1.5"
              >
                <Pencil size={13} /> 编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateQuote}
                disabled={quoteLoading}
                className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white h-9 px-4 font-bold gap-1.5"
              >
                {quoteLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                创建报价单
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="rounded-xl border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 h-9 px-4 font-bold gap-1.5"
              >
                <Trash2 size={13} /> 删除
              </Button>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">金额</p>
              <p className="text-2xl font-black text-white tabular-nums">
                {fmtMoney(opp.amount)}
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">预计结案</p>
              <p className="text-lg font-black text-white">
                {fmtDate(opp.closeDate)}
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">赢单概率</p>
              <div className="space-y-1.5">
                <p className="text-2xl font-black text-white">
                  {opp.probability != null ? `${opp.probability}%` : '—'}
                </p>
                {opp.probability != null && (
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${opp.probability}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">预测类别</p>
              <p className="text-lg font-black text-white">
                {opp.forecastCategory
                  ? (FORECAST_LABELS[opp.forecastCategory] ?? opp.forecastCategory)
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-base font-black text-ink">基本信息</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-6 space-y-4">
            <InfoRow
              label="所属客户"
              value={
                opp.account ? (
                  <Link
                    href={`/accounts/${opp.accountId}`}
                    className="inline-flex items-center gap-1.5 text-brand font-bold hover:underline"
                  >
                    <Building2 size={13} />
                    {opp.account.name}
                    <ChevronRight size={12} />
                  </Link>
                ) : (
                  <span className="text-slate-300">—</span>
                )
              }
            />
            <InfoRow
              label="阶段"
              value={
                <Badge
                  variant="outline"
                  className={cn('border-none font-bold text-xs px-2.5 py-0.5', stageColor(opp.stage))}
                >
                  {stageZh(opp.stage)}
                </Badge>
              }
            />
            <InfoRow
              label="创建时间"
              value={
                <span className="flex items-center gap-1.5 text-slate-500">
                  <CalendarDays size={13} className="text-slate-400" />
                  {fmtDate(opp.createdAt, 'YYYY-MM-DD HH:mm')}
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-base font-black text-ink">商机描述</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-6">
            {opp.description ? (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {opp.description}
              </p>
            ) : (
              <p className="text-sm text-slate-300 italic">暂无描述信息</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm font-bold text-slate-400 shrink-0 w-20">{label}</span>
      <div className="text-sm text-right">{value}</div>
    </div>
  );
}

// ── Tab: 产品明细 ──────────────────────────────────────────────────────────────

interface LineItemsTabProps {
  opp: Opportunity;
}

function LineItemsTab({ opp }: LineItemsTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const items: LineItem[] = opp.lineItems ?? [];
  const grandTotal = items.reduce((s, i) => s + Number(i.totalPrice ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-ink">产品明细</h3>
          <p className="text-sm text-slate-400 font-medium mt-0.5">
            共 <span className="font-black text-ink">{items.length}</span> 项产品
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="rounded-xl bg-brand hover:bg-brand-deep text-white h-10 px-5 font-bold shadow-lg shadow-brand/20 gap-1.5"
        >
          <Plus size={15} /> 添加产品
        </Button>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Package size={36} className="mx-auto text-slate-200" />
              <p className="text-slate-300 font-medium">暂无产品明细</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(true)}
                className="rounded-xl border-slate-200 font-bold gap-1.5 mt-2"
              >
                <Plus size={13} /> 添加第一条产品
              </Button>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['产品名称', '数量', '单价', '小计'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-ink">
                        {item.product?.name ?? item.productId}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium tabular-nums">
                        {fmtMoney(item.unitPrice)}
                      </td>
                      <td className="px-6 py-4 font-black text-ink tabular-nums">
                        {fmtMoney(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-100 bg-slate-50/50">
                    <td colSpan={3} className="px-6 py-4 text-right font-black text-ink text-sm">
                      合计金额
                    </td>
                    <td className="px-6 py-4 font-black text-xl text-ink tabular-nums">
                      {fmtMoney(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <AddLineItemModal
        oppId={opp.id}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

// ── Tab: 相关活动 ──────────────────────────────────────────────────────────────

function ActivitiesTab({ opportunityId }: { opportunityId: string }) {
  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
      <CardContent className="p-6">
        <ActivityTimeline relatedToType="opportunity" relatedToId={opportunityId} />
      </CardContent>
    </Card>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  open: boolean;
  oppName: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function DeleteConfirmDialog({ open, oppName, onClose, onConfirm, loading }: DeleteConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm rounded-3xl border-none shadow-2xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-ink">确认删除</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          确认删除商机 <span className="font-bold text-ink">「{oppName}」</span>？
          此操作不可撤销，所有关联数据将一并删除。
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl border-slate-200 h-11 px-6 font-bold"
          >
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-red-500 hover:bg-red-600 text-white h-11 px-6 font-bold shadow-lg shadow-red-500/20"
          >
            {loading ? '删除中…' : '确认删除'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: opp, isLoading, isError } = useQuery<Opportunity>({
    queryKey: ['opportunity', id],
    queryFn: () => oppsApi.get(id),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => oppsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      router.push('/opportunities');
    },
  });

  const quoteMutation = useMutation({
    mutationFn: () => quotesApi.fromOpp(id),
    onSuccess: (data: { id?: string }) => {
      if (data?.id) router.push(`/quotes/${data.id}`);
    },
  });

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3 py-20 justify-center text-slate-300">
          <Loader2 size={24} className="animate-spin" />
          <span className="font-medium">加载中…</span>
        </div>
      </div>
    );
  }

  if (isError || !opp) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="py-20 text-center space-y-4">
          <p className="text-xl font-black text-slate-300">商机不存在或已被删除</p>
          <Link href="/opportunities">
            <Button variant="outline" className="rounded-xl border-slate-200 font-bold gap-2">
              <ArrowLeft size={14} /> 返回商机列表
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/opportunities"
          className="font-bold text-slate-400 hover:text-brand transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={14} /> 商机列表
        </Link>
        <span className="text-slate-200">/</span>
        <span className="font-bold text-ink truncate max-w-xs">{opp.name}</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-slate-100 rounded-2xl p-1 h-11 mb-6">
          <TabsTrigger
            value="overview"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Target size={14} /> 详情
          </TabsTrigger>
          <TabsTrigger
            value="lineitems"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Package size={14} /> 产品明细
            {(opp.lineItems?.length ?? 0) > 0 && (
              <span className="ml-1 bg-brand/10 text-brand text-xs font-black px-1.5 py-0.5 rounded-full">
                {opp.lineItems!.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activities"
            className="rounded-xl text-sm font-bold px-5 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2"
          >
            <Activity size={14} /> 相关活动
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <OverviewTab
            opp={opp}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            onCreateQuote={() => quoteMutation.mutate()}
            quoteLoading={quoteMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="lineitems" className="mt-0">
          <LineItemsTab opp={opp} />
        </TabsContent>

        <TabsContent value="activities" className="mt-0">
          <ActivitiesTab opportunityId={id} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {editOpen && (
        <EditModal
          opp={opp}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}

      <DeleteConfirmDialog
        open={deleteOpen}
        oppName={opp.name}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
