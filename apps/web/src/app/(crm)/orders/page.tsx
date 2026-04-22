'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';
import { genericApi } from '@/lib/api';

const ORDER_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  {
    key: 'status', label: '状态', type: 'select', options: [
      { value: 'draft', label: '草稿' },
      { value: 'activated', label: '已激活' },
      { value: 'shipped', label: '已发货' },
      { value: 'delivered', label: '已交付' },
      { value: 'cancelled', label: '已取消' },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
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
}

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', activated: '已激活', shipped: '已发货',
  delivered: '已签收', cancelled: '已取消',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading } = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.list(activeFilters),
  });

  const orders: Order[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => genericApi.remove('order', id)));
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      return genericApi.update('order', id, { [field]: value });
    },
  });

  const columns: Column<Order>[] = [
    {
      key: 'orderNumber',
      label: '单号',
      editable: false,
      render: (row: Order) => (
        <span className="font-bold text-ink font-mono">{row.orderNumber}</span>
      ),
    },
    {
      key: 'quote',
      label: '关联报价单',
      render: (row: Order) =>
        row.quote?.quoteNumber ? (
          <Link
            href={`/quotes/${row.quoteId}`}
            className="font-medium text-brand hover:underline font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {row.quote.quoteNumber}
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'account',
      label: '客户',
      render: (row: Order) => (
        <span className="text-sm text-slate-600">{row.account?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: '状态',
      editable: true,
      type: 'select',
      options: [
        { value: 'draft', label: '草稿' },
        { value: 'activated', label: '已激活' },
        { value: 'shipped', label: '已发货' },
        { value: 'delivered', label: '已交付' },
        { value: 'cancelled', label: '已取消' },
      ],
      render: (row: Order) => (
        <Badge variant="outline" className={cn('border-none font-bold', statusColor(row.status))}>
          {STATUS_ZH[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'totalAmount',
      label: '总金额',
      editable: true,
      type: 'number',
      render: (row: Order) => <span className="text-sm font-bold text-ink">{fmtMoney(row.totalAmount)}</span>,
    },
    {
      key: 'activatedAt',
      label: '激活时间',
      editable: false,
      render: (row: Order) => <span className="text-sm text-slate-500">{fmtDate(row.activatedAt)}</span>,
    },
    {
      key: 'createdAt',
      label: '创建时间',
      editable: false,
      render: (row: Order) => <span className="text-sm text-slate-500">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <ShoppingCart size={14} />
            <span>销售管理</span>
          </div>
          <h1 className="text-3xl font-black text-ink tracking-tight">订单</h1>
          <p className="text-sm text-slate-400 mt-1">查看并管理所有销售订单</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-5 py-3.5 text-sm font-medium">
        <Info size={16} className="shrink-0 text-blue-500" />
        订单由报价单转换生成，请前往已接受的报价单页面点击「从商机创建订单」
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={ORDER_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={orders}
        columns={columns}
        onRowClick={(row) => router.push(`/orders/${row.id}`)}
        onDelete={(ids) => deleteMutation.mutateAsync(ids)}
        onUpdate={(id, field, value) => inlineUpdateMutation.mutateAsync({ id, field, value })}
        queryKey={['orders']}
        loading={isLoading}
      />
    </div>
  );
}