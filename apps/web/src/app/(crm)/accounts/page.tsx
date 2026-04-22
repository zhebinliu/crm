'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { accountsApi } from '@/lib/api';
import { fmtDate, fmtMoney, cn } from '@/lib/utils';
import { Plus, Building2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';

const ACCOUNT_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  { key: 'industry', label: '行业', type: 'text' },
  { key: 'billingCity', label: '城市', type: 'text' },
];

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', filters],
    queryFn: () => accountsApi.list(activeFilters),
  });

  const accounts: Account[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => accountsApi.remove(id)));
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      return accountsApi.update(id, { [field]: value });
    },
  });

  const columns: Column<Account>[] = [
    {
      key: 'name',
      label: '客户名称',
      editable: true,
      render: (row: Account) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={15} className="text-brand" />
          </div>
          <span className="font-bold text-ink">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'industry',
      label: '行业',
      editable: true,
      render: (row: Account) =>
        row.industry ? (
          <Badge variant="secondary" className="rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
            {row.industry}
          </Badge>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'phone',
      label: '电话',
      editable: true,
      render: (row: Account) => (
        <span className="text-sm text-slate-600">{row.phone ?? <span className="text-slate-300">—</span>}</span>
      ),
    },
    {
      key: 'annualRevenue',
      label: '年收入',
      editable: true,
      type: 'number',
      render: (row: Account) => (
        <span className="text-sm text-slate-700 font-medium">{fmtMoney(row.annualRevenue)}</span>
      ),
    },
    {
      key: 'billingCity',
      label: '城市',
      editable: true,
      render: (row: Account) => (
        <span className="text-sm text-slate-600">{row.billingCity ?? <span className="text-slate-300">—</span>}</span>
      ),
    },
    {
      key: 'createdAt',
      label: '创建时间',
      render: (row: Account) => <span className="text-sm text-slate-500">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <Building2 size={14} />
            <span>客户管理</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">客户</h1>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5"
        >
          <Plus size={16} className="mr-1.5" />
          新建客户
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={ACCOUNT_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={accounts}
        columns={columns}
        onRowClick={(row) => router.push(`/accounts/${row.id}`)}
        onDelete={(ids) => deleteMutation.mutateAsync(ids)}
        onUpdate={(id, field, value) => inlineUpdateMutation.mutateAsync({ id, field, value })}
        queryKey={['accounts']}
        loading={isLoading}
      />

      {/* Create Modal */}
      <CreateRecordModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        objectApiName="account"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
        }}
      />
    </div>
  );
}