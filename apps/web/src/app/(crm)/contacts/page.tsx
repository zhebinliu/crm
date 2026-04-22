'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { contactsApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { Plus, User, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';

const CONTACT_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  { key: 'department', label: '部门', type: 'text' },
  { key: 'title', label: '职位', type: 'text' },
];

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

// ── Initials Avatar ────────────────────────────────────────────────────────

function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600 font-bold text-xs">
      {firstName.charAt(0)}{lastName.charAt(0)}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => contactsApi.list(activeFilters),
  });

  const contacts: Contact[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => contactsApi.remove(id)));
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      const payload: Record<string, unknown> = {};
      if (field === 'firstName' || field === 'lastName' || field === 'title' || field === 'email' || field === 'phone') {
        payload[field] = value;
      } else if (field === 'account') {
        payload.accountId = value;
      }
      return contactsApi.update(id, payload);
    },
  });

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      label: '姓名',
      editable: true,
      render: (row: Contact) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} />
          <span className="font-bold text-ink">
            {row.firstName} {row.lastName}
          </span>
        </div>
      ),
    },
    {
      key: 'account',
      label: '公司',
      editable: true,
      type: 'related',
      relatedTo: 'account',
      relatedLabelField: 'name',
      render: (row: Contact) =>
        row.account?.name ? (
          <span
            className="hover:text-brand hover:underline transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (row.accountId) router.push(`/accounts/${row.accountId}`);
            }}
          >
            {row.account.name}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'title',
      label: '职位',
      editable: true,
      render: (row: Contact) =>
        row.title ? <span className="text-sm text-slate-600">{row.title}</span> : <span className="text-slate-300">—</span>,
    },
    {
      key: 'email',
      label: '邮箱',
      editable: true,
      type: 'email',
      render: (row: Contact) =>
        row.email ? (
          <a
            href={`mailto:${row.email}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand transition-colors"
          >
            <Mail size={13} className="text-slate-400" />
            {row.email}
          </a>
        ) : (
          <span className="text-slate-300 text-sm">—</span>
        ),
    },
    {
      key: 'phone',
      label: '电话',
      editable: true,
      type: 'phone',
      render: (row: Contact) =>
        row.phone ? (
          <a
            href={`tel:${row.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand transition-colors"
          >
            <Phone size={13} className="text-slate-400" />
            {row.phone}
          </a>
        ) : (
          <span className="text-slate-300 text-sm">—</span>
        ),
    },
    {
      key: 'createdAt',
      label: '创建时间',
      render: (row: Contact) => <span className="text-sm text-slate-500">{fmtDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em]">
            <User size={14} />
            <span>联系人管理</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">联系人</h1>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-brand hover:bg-brand-deep text-white rounded-xl font-bold h-10 px-5"
        >
          <Plus size={16} className="mr-1.5" />
          新建联系人
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        fields={CONTACT_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* Data Table */}
      <DataTable
        data={contacts}
        columns={columns}
        onRowClick={(row) => router.push(`/contacts/${row.id}`)}
        onDelete={(ids) => deleteMutation.mutateAsync(ids)}
        onUpdate={(id, field, value) => inlineUpdateMutation.mutateAsync({ id, field, value })}
        queryKey={['contacts']}
        loading={isLoading}
      />

      {/* Create Modal */}
      <CreateRecordModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        objectApiName="contact"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        }}
      />
    </div>
  );
}