'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ordersApi, accountsApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, ShoppingCart, Zap, FileSignature,
  Package,
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
import { contractsApi } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LineItem {
  id?: string;
  productId: string;
  product?: { name: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: string;
  orderNumber: string;
  quoteId?: string;
  quote?: { quoteNumber: string };
  accountId?: string;
  account?: { name: string };
  status: string;
  totalAmount: number;
  activatedAt?: string | null;
  createdAt: string;
  lineItems?: LineItem[];
}

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', activated: '已激活', shipped: '已发货',
  delivered: '已签收', cancelled: '已取消',
};

// ─── Contract Form Modal (inline, launched from Order detail) ─────────────────
function ContractFromOrderModal({
  orderId,
  accountId,
  accountName,
  open,
  onClose,
}: {
  orderId: string;
  accountId?: string;
  accountName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    accountId: accountId ?? '',
    orderId,
    startDate: '',
    endDate: '',
    totalValue: '',
    description: '',
  });
  const [error, setError] = useState('');

  // Fetch accounts for the lookup select (used when accountId not pre-filled from order)
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-lookup'],
    queryFn: () => accountsApi.list({ take: 100 }),
    enabled: !accountId,
  });
  const accountOptions: { id: string; name: string }[] = accountsData?.data ?? accountsData ?? [];

  const mutation = useMutation({
    mutationFn: (data: typeof form) => contractsApi.create(data),
    onSuccess: (data) => router.push(`/contracts/${data.id}`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : '创建失败，请重试'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountId.trim()) { setError('请选择客户'); return; }
    if (!form.startDate) { setError('请选择开始日期'); return; }
    if (!form.endDate) { setError('请选择结束日期'); return; }
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-lg font-bold text-ink flex items-center gap-2">
            <FileSignature size={16} className="text-brand" />
            从订单生成合同
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
                客户 <span className="text-red-400">*</span>
              </Label>
              {accountId ? (
                // Pre-filled from the order — show as read-only
                <div className="rounded-xl border border-slate-200 h-10 px-3 flex items-center bg-slate-50 text-sm font-medium text-ink">
                  {accountName ?? accountId}
                </div>
              ) : (
                <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                  <SelectTrigger className="rounded-xl h-10 border-slate-200">
                    <SelectValue placeholder="选择客户" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  开始日期 <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="rounded-xl border-slate-200 h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  结束日期 <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="rounded-xl border-slate-200 h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">合同金额 (¥)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.totalValue}
                onChange={(e) => setForm({ ...form, totalValue: e.target.value })}
                placeholder="0.00"
                className="rounded-xl border-slate-200 h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">合同描述</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="选填"
                className="rounded-xl border-slate-200 h-10"
              />
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
              生成合同
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [contractModalOpen, setContractModalOpen] = useState(false);

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
    enabled: !!id,
  });

  const activateMutation = useMutation({
    mutationFn: () => ordersApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span className="font-medium">加载中…</span>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertCircle size={18} />
        <span className="font-medium">加载失败，请返回重试</span>
      </div>
    );
  }

  const lineItems: LineItem[] = order.lineItems ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/orders">
            <Button variant="ghost" className="rounded-xl h-10 w-10 p-0 hover:bg-slate-100">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-ink tracking-tight font-mono">
                {order.orderNumber}
              </h1>
              <Badge
                variant="outline"
                className={cn('border-none font-bold', statusColor(order.status))}
              >
                {STATUS_ZH[order.status] ?? order.status}
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {order.account?.name ?? '—'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {order.status === 'draft' && (
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-emerald-200"
            >
              {activateMutation.isPending
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <Zap size={14} className="mr-2" />}
              激活订单
            </Button>
          )}
          <Button
            onClick={() => setContractModalOpen(true)}
            className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-brand/20"
          >
            <FileSignature size={14} className="mr-2" />
            生成合同
          </Button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          {
            label: '关联报价单',
            value: order.quote?.quoteNumber ? (
              <Link href={`/quotes/${order.quoteId}`} className="font-bold text-brand hover:underline font-mono text-sm">
                {order.quote.quoteNumber}
              </Link>
            ) : <span className="text-slate-400 text-sm">—</span>,
          },
          {
            label: '客户',
            value: order.account?.name ? (
              <span className="font-bold text-ink text-sm">{order.account.name}</span>
            ) : <span className="text-slate-400 text-sm">—</span>,
          },
          {
            label: '总金额',
            value: <span className="font-black text-ink text-base">{fmtMoney(order.totalAmount)}</span>,
          },
          {
            label: '状态',
            value: (
              <Badge variant="outline" className={cn('border-none font-bold', statusColor(order.status))}>
                {STATUS_ZH[order.status] ?? order.status}
              </Badge>
            ),
          },
          {
            label: '激活时间',
            value: <span className="font-medium text-ink text-sm">{fmtDate(order.activatedAt)}</span>,
          },
          {
            label: '创建时间',
            value: <span className="font-medium text-ink text-sm">{fmtDate(order.createdAt)}</span>,
          },
        ].map((item) => (
          <Card key={item.label} className="border-none shadow-xl shadow-slate-200/40 rounded-2xl bg-white">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{item.label}</p>
              {item.value}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Line Items */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 px-6 py-4">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Package size={16} className="text-brand" />
            产品明细
            <span className="ml-1 text-xs font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
              {lineItems.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lineItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
              <Package size={36} strokeWidth={1} />
              <p className="font-medium text-sm">暂无产品行</p>
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
                <div className="flex items-center gap-3 text-base font-black text-ink">
                  <span>订单总额</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span>{fmtMoney(order.totalAmount)}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contract Modal */}
      <ContractFromOrderModal
        orderId={id}
        accountId={order.accountId}
        accountName={order.account?.name}
        open={contractModalOpen}
        onClose={() => setContractModalOpen(false)}
      />
    </div>
  );
}
