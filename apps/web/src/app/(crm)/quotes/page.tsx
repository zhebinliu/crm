'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2, Eye, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';

const QUOTE_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  {
    key: 'status', label: '状态', type: 'select', options: [
      { value: 'draft', label: '草稿' },
      { value: 'in_review', label: '审批中' },
      { value: 'approved', label: '已批准' },
      { value: 'rejected', label: '已拒绝' },
      { value: 'accepted', label: '客户接受' },
      { value: 'expired', label: '已过期' },
    ],
  },
];

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', in_review: '审批中', approved: '已批准',
  presented: '已呈递', accepted: '已接受', rejected: '已拒绝', expired: '已过期',
};

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
  createdAt: string;
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteDialog({
  quote,
  onClose,
}: {
  quote: Quote | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => quotesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onClose();
    },
  });

  return (
    <Dialog open={!!quote} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-lg font-bold text-ink">确认删除</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 text-sm text-slate-500">
          确定要删除报价单{' '}
          <span className="font-bold text-ink">{quote?.quoteNumber}</span> 吗？此操作不可撤销。
        </div>
        <DialogFooter className="px-6 pb-6 pt-4 flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1 rounded-xl h-10 font-bold">
            取消
          </Button>
          <Button
            onClick={() => quote && mutation.mutate(quote.id)}
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

export default function QuotesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quotes', filters],
    queryFn: () => quotesApi.list(activeFilters),
  });

  const quotes: Quote[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => quotesApi.remove(id)));
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      return quotesApi.update(id, { [field]: value });
    },
  });

  const columns: Column<Quote>[] = [
    {
      key: 'quoteNumber',
      label: '单号',
      editable: false,
      render: (row: Quote) => (
        <span className="font-bold text-ink font-mono">{row.quoteNumber}</span>
      ),
    },
    {
      key: 'opportunity',
      label: '商机',
      render: (row: Quote) => (
        <span className="text-sm text-slate-600">{row.opportunity?.name ?? row.opportunityId ?? '—'}</span>
      ),
    },
    {
      key: 'account',
      label: '客户',
      render: (row: Quote) => (
        <span className="text-sm text-slate-600">{row.opportunity?.account?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: '状态',
      editable: true,
      type: 'select',
      options: [
        { value: 'draft', label: '草稿' },
        { value: 'in_review', label: '审批中' },
        { value: 'approved', label: '已批准' },
        { value: 'rejected', label: '已拒绝' },
        { value: 'accepted', label: '客户接受' },
        { value: 'expired', label: '已过期' },
      ],
      render: (row: Quote) => (
        <Badge variant="outline" className={cn('border-none font-bold', statusColor(row.status))}>
          {STATUS_ZH[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'subtotal',
      label: '小计',
      editable: true,
      type: 'number',
      render: (row: Quote) => <span className="text-sm text-slate-600">{fmtMoney(row.subtotal)}</span>,
    },
    {
      key: 'grandTotal',
      label: '税后总额',
      editable: false,
      render: (row: Quote) => <span className="text-sm font-bold text-ink">{fmtMoney(row.grandTotal)}</span>,
    },
    {
      key: 'expiresAt',
      label: '到期日',
      editable: true,
      type: 'text',
      render: (row: Quote) => <span className="text-sm text-slate-500">{fmtDate(row.expiresAt)}</span>,
    },
    {
      key: 'createdAt',
      label: '创建时间',
      editable: false,
      render: (row: Quote) => <span className="text-sm text-slate-500">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <FileText size={14} />
            <span>销售管理</span>
          </div>
          <h1 className="text-3xl font-black text-ink tracking-tight">报价单</h1>
          <p className="text-sm text-slate-400 mt-1">管理所有客户报价，跟踪审批状态</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-brand/20"
        >
          <Plus size={16} className="mr-2" />
          新建报价单
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={QUOTE_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={quotes}
        columns={columns}
        onRowClick={(row) => router.push(`/quotes/${row.id}`)}
        onDelete={(ids) => deleteMutation.mutateAsync(ids)}
        onUpdate={(id, field, value) => inlineUpdateMutation.mutateAsync({ id, field, value })}
        queryKey={['quotes']}
        loading={isLoading}
      />

      {/* Modals */}
      <CreateRecordModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        objectApiName="quote"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
        }}
      />
      <DeleteDialog quote={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}