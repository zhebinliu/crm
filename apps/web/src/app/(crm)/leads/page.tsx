'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { leadsApi } from '@/lib/api';
import { fmtRelative, ratingColor, statusColor, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { Plus, Users } from 'lucide-react';
import { DataTable, Column } from '@/components/crm/data-table';

const LEAD_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  {
    key: 'status', label: '状态', type: 'select', options: [
      { value: 'new', label: '新线索' },
      { value: 'working', label: '跟进中' },
      { value: 'qualified', label: '已资质' },
      { value: 'unqualified', label: '未资质' },
      { value: 'nurturing', label: '培育中' },
    ],
  },
  {
    key: 'rating', label: '评级', type: 'select', options: [
      { value: 'hot', label: '热' },
      { value: 'warm', label: '暖' },
      { value: 'cold', label: '冷' },
    ],
  },
  { key: 'industry', label: '行业', type: 'text' },
  { key: 'source', label: '来源', type: 'text' },
];

const STATUS_ZH: Record<string, string> = {
  new: '新建', working: '跟进中', nurturing: '培育中',
  qualified: '已认定', unqualified: '未认定',
};

const RATING_ZH: Record<string, string> = {
  hot: '热', warm: '暖', cold: '冷',
};

interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  rating?: string;
  status?: string;
  isConverted?: boolean;
  createdAt: string;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading } = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsApi.list({ take: 200, ...activeFilters }),
  });

  const leads: Lead[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => leadsApi.remove(id)));
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      return leadsApi.update(id, { [field]: value });
    },
  });

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      label: '姓名',
      editable: true,
      render: (row: Lead) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand/20 to-brand-deep/10 flex items-center justify-center text-brand font-black text-sm">
            {(row.firstName?.[0] ?? row.lastName?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-ink text-sm">
              {row.firstName ?? ''} {row.lastName ?? ''}
            </p>
            {row.isConverted && (
              <span className="text-[10px] text-emerald-500 font-bold">已转化</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      label: '公司',
      editable: true,
      render: (row: Lead) => (
        <span className="text-sm font-medium text-slate-600">{row.company || '—'}</span>
      ),
    },
    {
      key: 'email',
      label: '邮箱',
      editable: true,
      type: 'email',
      render: (row: Lead) => (
        <span className="text-sm text-slate-500 font-medium">{row.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      label: '电话',
      editable: true,
      type: 'phone',
      render: (row: Lead) => (
        <span className="text-sm text-slate-500 font-medium">{row.phone || '—'}</span>
      ),
    },
    {
      key: 'rating',
      label: '评级',
      editable: true,
      type: 'select',
      options: [
        { value: 'hot', label: '热' },
        { value: 'warm', label: '暖' },
        { value: 'cold', label: '冷' },
      ],
      render: (row: Lead) =>
        row.rating ? (
          <Badge variant="outline" className={cn('border-none font-bold text-xs', ratingColor(row.rating))}>
            {RATING_ZH[row.rating] ?? row.rating}
          </Badge>
        ) : (
          <span className="text-slate-300 text-sm">—</span>
        ),
    },
    {
      key: 'status',
      label: '状态',
      editable: true,
      type: 'select',
      options: [
        { value: 'new', label: '新线索' },
        { value: 'working', label: '跟进中' },
        { value: 'qualified', label: '已资质' },
        { value: 'unqualified', label: '未资质' },
        { value: 'nurturing', label: '培育中' },
      ],
      render: (row: Lead) =>
        row.status ? (
          <Badge variant="outline" className={cn('border-none font-bold text-xs', statusColor(row.status))}>
            {STATUS_ZH[row.status] ?? row.status}
          </Badge>
        ) : (
          <span className="text-slate-300 text-sm">—</span>
        ),
    },
    {
      key: 'createdAt',
      label: '创建时间',
      render: (row: Lead) => (
        <span className="text-sm text-slate-400 font-medium" title={row.createdAt}>
          {fmtRelative(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <Users size={14} />
            <span>销售线索</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">线索</h1>
          <p className="text-sm text-slate-400 font-medium">
            共 {data?.total ?? leads.length} 条线索
          </p>
        </div>
        <Button
          className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-11 px-6 shadow-xl shadow-brand/20 gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} />
          新建线索
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={LEAD_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={leads}
        columns={columns}
        onRowClick={(row) => router.push(`/leads/${row.id}`)}
        onDelete={async (ids) => {
          await deleteMutation.mutateAsync(ids);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
        onUpdate={(id, field, value) => inlineUpdateMutation.mutateAsync({ id, field, value })}
        onBulkUpdate={async (ids, field, value) => {
          await Promise.all(ids.map((id) => leadsApi.update(id, { [field]: value })));
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
        queryKey={['leads']}
        loading={isLoading}
      />

      <CreateRecordModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        objectApiName="lead"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />
    </div>
  );
}