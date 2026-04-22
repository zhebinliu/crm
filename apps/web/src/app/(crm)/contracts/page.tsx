'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractsApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { FileSignature, Plus, Eye, Zap, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';

const CONTRACT_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  {
    key: 'status', label: '状态', type: 'select', options: [
      { value: 'draft', label: '草稿' },
      { value: 'activated', label: '已激活' },
      { value: 'terminated', label: '已终止' },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contract {
  id: string;
  contractNumber: string;
  accountId?: string;
  account?: { name: string };
  orderId?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  totalValue?: number;
  description?: string;
  createdAt: string;
}

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', activated: '已激活', terminated: '已终止',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contracts', filters],
    queryFn: () => contractsApi.list(activeFilters),
  });

  const contracts: Contract[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => contractsApi.remove(id)));
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => contractsApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const terminateMutation = useMutation({
    mutationFn: (id: string) => contractsApi.terminate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });

  const columns: Column<Contract>[] = [
    {
      key: 'contractNumber',
      label: '合同号',
      editable: false,
      render: (row: Contract) => (
        <span className="font-bold text-ink font-mono">{row.contractNumber}</span>
      ),
    },
    {
      key: 'account',
      label: '客户',
      render: (row: Contract) => (
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
        { value: 'terminated', label: '已终止' },
      ],
      render: (row: Contract) => (
        <Badge variant="outline" className={cn('border-none font-bold', statusColor(row.status))}>
          {STATUS_ZH[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'startDate',
      label: '开始日期',
      editable: true,
      type: 'text',
      render: (row: Contract) => <span className="text-sm text-slate-500">{fmtDate(row.startDate)}</span>,
    },
    {
      key: 'endDate',
      label: '结束日期',
      editable: true,
      type: 'text',
      render: (row: Contract) => <span className="text-sm text-slate-500">{fmtDate(row.endDate)}</span>,
    },
    {
      key: 'totalValue',
      label: '合同金额',
      editable: true,
      type: 'number',
      render: (row: Contract) => <span className="text-sm font-bold text-ink">{fmtMoney(row.totalValue)}</span>,
    },
    {
      key: 'createdAt',
      label: '创建时间',
      render: (row: Contract) => <span className="text-sm text-slate-500">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <FileSignature size={14} />
            <span>合同管理</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">合同</h1>
          <p className="text-sm text-slate-400 mt-1">管理所有客户合同，跟踪生效与终止状态</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-brand/20"
        >
          <Plus size={16} className="mr-2" />
          新建合同
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={CONTRACT_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={contracts}
        columns={columns}
        onRowClick={(row) => router.push(`/contracts/${row.id}`)}
        onDelete={(ids) => deleteMutation.mutateAsync(ids)}
        onUpdate={(id, field, value) => contractsApi.update(id, { [field]: value })}
        queryKey={['contracts']}
        loading={isLoading}
      />

      {/* Modal */}
      <CreateRecordModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        objectApiName="contract"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
        }}
      />
    </div>
  );
}