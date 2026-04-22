'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { quotesApi, ordersApi, approvalApi, productsApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, FileText, Plus,
  SendHorizonal, ShoppingCart, Trash2, Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LineItem {
  id?: string;
  productId: string;
  product?: { name: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  opportunityId: string;
  opportunity?: { name: string; account?: { name: string } };
  status: string;
  subtotal: number;
  taxRate: number;
  discount: number;
  grandTotal: number;
  expiresAt?: string | null;
  lineItems?: LineItem[];
  createdAt: string;
}

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', in_review: '审批中', approved: '已批准',
  presented: '已呈递', accepted: '已接受', rejected: '已拒绝', expired: '已过期',
};

// ─── Add Line Item Modal ──────────────────────────────────────────────────────
function AddLineItemModal({
  quoteId,
  open,
  onClose,
}: {
  quoteId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ productId: '', quantity: 1, unitPrice: 0 });
  const [error, setError] = useState('');

  const { data: productsData } = useQuery({
    queryKey: ['products-lookup'],
    queryFn: () => productsApi.list({ take: 100 }),
  });
  const productOptions: { id: string; name: string; defaultPrice?: number; isActive?: boolean }[] =
    productsData?.data ?? productsData ?? [];

  function handleProductSelect(id: string) {
    const product = productOptions.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      productId: id,
      unitPrice: product?.defaultPrice != null ? product.defaultPrice : f.unitPrice,
    }));
    setError('');
  }

  const mutation = useMutation({
    mutationFn: (data: typeof form) => quotesApi.addLineItem(quoteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
      onClose();
      setForm({ productId: '', quantity: 1, unitPrice: 0 });
      setError('');
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : '添加失败，请重试');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId.trim()) { setError('请选择产品'); return; }
    if (form.quantity < 1) { setError('数量必须大于 0'); return; }
    if (form.unitPrice < 0) { setError('单价不能为负数'); return; }
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-lg font-bold text-ink flex items-center gap-2">
            <Package size={16} className="text-brand" />
            添加产品行
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                产品 <span className="text-red-400">*</span>
              </Label>
              <SelectPrimitive value={form.productId} onValueChange={handleProductSelect}>
                <SelectTriggerPrimitive className="rounded-xl border-slate-200 h-10 text-sm">
                  <SelectValuePrimitive placeholder="选择产品…" />
                </SelectTriggerPrimitive>
                <SelectContentPrimitive className="rounded-xl">
                  {productOptions.filter((p) => p.isActive !== false).map((p) => (
                    <SelectItemPrimitive key={p.id} value={p.id} className="rounded-lg text-sm">
                      <span className="font-medium">{p.name}</span>
                      {p.defaultPrice != null && (
                        <span className="ml-2 text-xs text-slate-400">
                          ¥{Number(p.defaultPrice).toLocaleString()}
                        </span>
                      )}
                    </SelectItemPrimitive>
                  ))}
                </SelectContentPrimitive>
              </SelectPrimitive>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">数量</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
                  className="rounded-xl border-slate-200 h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">单价 (¥)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.unitPrice}
                  onChange={(e) => setForm({ ...form, unitPrice: parseFloat(e.target.value) || 0 })}
                  className="rounded-xl border-slate-200 h-10"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-2 flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl h-10 font-bold">
              取消
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10"
            >
              {mutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              添加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────
function DeleteQuoteDialog({ quoteId, quoteNumber, open, onClose }: {
  quoteId: string; quoteNumber: string; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () => quotesApi.remove(quoteId),
    onSuccess: () => router.push('/quotes'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-lg font-bold text-ink">确认删除报价单</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 text-sm text-slate-500">
          确定要删除报价单 <span className="font-bold text-ink">{quoteNumber}</span> 吗？此操作不可撤销。
        </div>
        <DialogFooter className="px-6 pb-6 pt-4 flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1 rounded-xl h-10 font-bold">取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold h-10"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: quote, isLoading, isError } = useQuery<Quote>({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.get(id),
    enabled: !!id,
  });

  const submitApprovalMutation = useMutation({
    mutationFn: () =>
      approvalApi.submit({ objectType: 'Quote', objectId: id, submittedBy: 'current-user' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote', id] }),
  });

  const createOrderMutation = useMutation({
    mutationFn: () => ordersApi.fromQuote(id),
    onSuccess: (data) => router.push(`/orders/${data.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => quotesApi.remove(id),
    onSuccess: () => router.push('/quotes'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span className="font-medium">加载中…</span>
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertCircle size={18} />
        <span className="font-medium">加载失败，请返回重试</span>
      </div>
    );
  }

  const lineItems: LineItem[] = quote.lineItems ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/quotes">
            <Button variant="ghost" className="rounded-xl h-10 w-10 p-0 hover:bg-slate-100">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-ink tracking-tight font-mono">
                {quote.quoteNumber}
              </h1>
              <Badge
                variant="outline"
                className={cn('border-none font-bold', statusColor(quote.status))}
              >
                {STATUS_ZH[quote.status] ?? quote.status}
              </Badge>
            </div>
            {quote.opportunity?.name && (
              <p className="text-sm text-slate-400 mt-1">
                商机：{quote.opportunity.name}
                {quote.opportunity.account?.name && (
                  <> · <span className="font-medium">{quote.opportunity.account.name}</span></>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {quote.status === 'draft' && (
            <Button
              onClick={() => submitApprovalMutation.mutate()}
              disabled={submitApprovalMutation.isPending}
              className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-brand/20"
            >
              {submitApprovalMutation.isPending
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <SendHorizonal size={14} className="mr-2" />}
              提交审批
            </Button>
          )}
          {quote.status === 'accepted' && (
            <Button
              onClick={() => createOrderMutation.mutate()}
              disabled={createOrderMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold h-10 px-5"
            >
              {createOrderMutation.isPending
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <ShoppingCart size={14} className="mr-2" />}
              从商机创建订单
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="rounded-xl h-10 px-4 font-bold text-red-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={14} className="mr-2" />
            删除
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white col-span-2 sm:col-span-1">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">税后总额</p>
            <p className="text-3xl font-black text-ink">{fmtMoney(quote.grandTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">小计</p>
            <p className="text-xl font-bold text-slate-700">{fmtMoney(quote.subtotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">税率</p>
            <p className="text-xl font-bold text-slate-700">{quote.taxRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">折扣</p>
            <p className="text-xl font-bold text-slate-700">{quote.discount}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <Tabs defaultValue="lines">
          <div className="border-b border-slate-100 px-6 pt-4">
            <TabsList className="h-10 bg-slate-50 rounded-xl p-1">
              <TabsTrigger value="lines" className="rounded-lg font-bold text-sm">
                产品明细
              </TabsTrigger>
              <TabsTrigger value="approval" className="rounded-lg font-bold text-sm">
                审批记录
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab 1: Line Items */}
          <TabsContent value="lines" className="mt-0">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <p className="text-sm font-bold text-slate-500">
                共 {lineItems.length} 项产品
              </p>
              <Button
                size="sm"
                onClick={() => setAddLineItemOpen(true)}
                className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-8 px-4 text-xs"
              >
                <Plus size={12} className="mr-1.5" />
                添加产品行
              </Button>
            </div>

            {lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
                <Package size={36} strokeWidth={1} />
                <p className="font-medium text-sm">暂无产品行，点击右上角添加</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-100">
                      <tr>
                        {['产品', '数量', '单价', '合计'].map((h) => (
                          <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {lineItems.map((item, idx) => (
                        <tr key={item.id ?? idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-ink">
                            {item.product?.name ?? item.productId}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.quantity}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fmtMoney(item.unitPrice)}</td>
                          <td className="px-6 py-4 text-sm font-bold text-ink">{fmtMoney(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end px-6 py-4 border-t border-slate-100">
                  <div className="space-y-1 text-right min-w-[220px]">
                    <div className="flex justify-between gap-8 text-sm text-slate-500">
                      <span>小计</span>
                      <span className="font-medium">{fmtMoney(quote.subtotal)}</span>
                    </div>
                    {quote.discount > 0 && (
                      <div className="flex justify-between gap-8 text-sm text-emerald-600">
                        <span>折扣 ({quote.discount}%)</span>
                        <span className="font-medium">
                          -{fmtMoney(Number(quote.subtotal) * quote.discount / 100)}
                        </span>
                      </div>
                    )}
                    {quote.taxRate > 0 && (
                      <div className="flex justify-between gap-8 text-sm text-slate-500">
                        <span>税额 ({quote.taxRate}%)</span>
                        <span className="font-medium">
                          +{fmtMoney(Number(quote.subtotal) * (1 - quote.discount / 100) * quote.taxRate / 100)}
                        </span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between gap-8 text-base font-black text-ink">
                      <span>总计</span>
                      <span>{fmtMoney(quote.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* Tab 2: Approval History */}
          <TabsContent value="approval" className="mt-0">
            <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-3">
              <FileText size={40} strokeWidth={1} />
              <p className="font-medium">审批记录</p>
              <p className="text-xs text-slate-300">暂无审批记录</p>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Modals */}
      <AddLineItemModal quoteId={id} open={addLineItemOpen} onClose={() => setAddLineItemOpen(false)} />
      <DeleteQuoteDialog
        quoteId={id}
        quoteNumber={quote.quoteNumber}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
