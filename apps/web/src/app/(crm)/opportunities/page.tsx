'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { oppsApi } from '@/lib/api';
import { fmtDate, fmtMoney, stageColor, cn } from '@/lib/utils';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateRecordModal } from '@/components/dynamic/create-record-modal';
import { FilterBar, FilterField } from '@/components/crm/filter-bar';
import { DataTable, Column } from '@/components/crm/data-table';
import {
  Plus, TrendingUp, LayoutList, Columns3, ChevronRight,
  Building2, CalendarDays, DollarSign, Target,
} from 'lucide-react';

const OPP_FILTERS: FilterField[] = [
  { key: 'search', label: '搜索', type: 'text' },
  {
    key: 'stage', label: '阶段', type: 'select', options: [
      { value: 'prospecting', label: '初步接触' },
      { value: 'qualification', label: '潜在资质' },
      { value: 'needs_analysis', label: '方案需求' },
      { value: 'proposal', label: '正式提案' },
      { value: 'negotiation', label: '商务谈判' },
      { value: 'closed_won', label: '已赢单' },
      { value: 'closed_lost', label: '已丢单' },
    ],
  },
  {
    key: 'isClosed', label: '已关闭', type: 'select', options: [
      { value: 'false', label: '进行中' },
      { value: 'true', label: '已关闭' },
    ],
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const OPEN_STAGES = STAGES.filter(
  (s) => s.value !== 'closed_won' && s.value !== 'closed_lost',
);

function stageZh(s: string) {
  return STAGES.find((st) => st.value === s)?.label ?? s;
}

// ── List View (DataTable) ─────────────────────────────────────────────────────

interface ListViewProps {
  opps: Opportunity[];
  onRowClick: (row: Opportunity) => void;
}

function ListView({ opps, onRowClick }: ListViewProps) {
  const columns: Column<Opportunity>[] = [
    {
      key: 'name',
      label: '商机名称',
      editable: false,
      render: (row: Opportunity) => (
        <span className="font-bold text-ink hover:text-brand transition-colors">{row.name}</span>
      ),
    },
    {
      key: 'account',
      label: '客户',
      render: (row: Opportunity) => (
        <span className="flex items-center gap-1.5 text-slate-500 font-medium">
          <Building2 size={13} className="text-slate-400" />
          {row.account?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'stage',
      label: '阶段',
      editable: true,
      type: 'select',
      options: STAGES.map((s) => ({ value: s.value, label: s.label })),
      render: (row: Opportunity) => (
        <Badge variant="outline" className={cn('border-none font-bold px-2.5 py-0.5 text-xs', stageColor(row.stage))}>
          {stageZh(row.stage)}
        </Badge>
      ),
    },
    {
      key: 'amount',
      label: '金额',
      editable: true,
      type: 'number',
      render: (row: Opportunity) => (
        <span className="font-black text-ink tabular-nums">{fmtMoney(row.amount)}</span>
      ),
    },
    {
      key: 'closeDate',
      label: '预计结案日期',
      editable: true,
      type: 'text',
      render: (row: Opportunity) => (
        <span className="flex items-center gap-1.5 text-slate-500 font-medium">
          <CalendarDays size={13} className="text-slate-400" />
          {fmtDate(row.closeDate)}
        </span>
      ),
    },
    {
      key: 'probability',
      label: '赢单概率',
      editable: true,
      type: 'number',
      render: (row: Opportunity) =>
        row.probability != null ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-brand" style={{ width: `${row.probability}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-500">{row.probability}%</span>
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  return (
    <DataTable
      data={opps}
      columns={columns}
      onRowClick={onRowClick}
      queryKey={['opportunities']}
      onUpdate={(id, field, value) => oppsApi.update(id, { [field]: value })}
    />
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────

interface KanbanViewProps {
  opps: Opportunity[];
  onStageChange: (id: string, newStage: string) => void;
}

function KanbanView({ opps, onStageChange }: KanbanViewProps) {
  // Local optimistic state — mirrors the server data but updated immediately on drop
  const [localOpps, setLocalOpps] = useState<Opportunity[]>(opps);
  // Keep local state in sync when server data changes (e.g. after invalidation)
  const prevOppsRef = useRef(opps);
  if (prevOppsRef.current !== opps) {
    prevOppsRef.current = opps;
    setLocalOpps(opps);
  }

  // Drag state
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, opp: Opportunity) => {
    draggingIdRef.current = opp.id;
    setDraggingId(opp.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', opp.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverStage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageValue: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStage(stageValue);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving to outside the column (not a child element)
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) {
      setOverStage(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setOverStage(null);
    const id = draggingIdRef.current ?? e.dataTransfer.getData('text/plain');
    if (!id) return;

    const opp = localOpps.find((o) => o.id === id);
    if (!opp || opp.stage === targetStage) return;

    const prevOpps = localOpps;
    // Optimistic update
    setLocalOpps((prev) => prev.map((o) => o.id === id ? { ...o, stage: targetStage } : o));

    // Notify parent (which calls the API + handles revert)
    onStageChange(id, targetStage);
  }, [localOpps, onStageChange]);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {OPEN_STAGES.map((stage) => {
          const cards = localOpps.filter((o) => o.stage === stage.value);
          const total = cards.reduce((s, o) => s + Number(o.amount ?? 0), 0);
          const isOver = overStage === stage.value;
          return (
            <div
              key={stage.value}
              className="w-64 flex-shrink-0"
              onDragOver={(e) => handleDragOver(e, stage.value)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.value)}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('border-none font-bold text-xs px-2.5 py-0.5', stageColor(stage.value))}>
                    {stage.label}
                  </Badge>
                  <span className="text-xs font-bold text-slate-400 tabular-nums">{cards.length}</span>
                </div>
                <span className="text-xs font-black text-slate-400 tabular-nums">
                  {cards.length > 0 ? fmtMoney(total) : ''}
                </span>
              </div>
              <div
                className={cn(
                  'space-y-3 min-h-20 rounded-2xl transition-all duration-150',
                  isOver && 'outline outline-2 outline-dashed outline-brand/50 bg-brand/[0.03] p-2',
                )}
              >
                {cards.map((opp) => {
                  const isDragging = draggingId === opp.id;
                  return (
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, opp)}
                      onDragEnd={handleDragEnd}
                      className={cn('transition-opacity', isDragging && 'opacity-50')}
                      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                      <Link
                        href={`/opportunities/${opp.id}`}
                        onClick={(e) => {
                          // Prevent navigation if a drag was just happening
                          if (draggingIdRef.current) e.preventDefault();
                        }}
                        draggable={false}
                      >
                        <div className="bg-white rounded-2xl p-4 shadow-md shadow-slate-100/60 border border-slate-100/80 hover:shadow-xl hover:shadow-brand/5 hover:border-brand/20 transition-all group cursor-[inherit]">
                          <p className="font-bold text-ink text-sm leading-snug group-hover:text-brand transition-colors line-clamp-2">
                            {opp.name}
                          </p>
                          {opp.account?.name && (
                            <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1">
                              <Building2 size={11} />
                              {opp.account.name}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                            <p className="text-base font-black text-ink tabular-nums">{fmtMoney(opp.amount)}</p>
                            {opp.closeDate && (
                              <Badge variant="outline" className="border-slate-200 text-slate-400 font-bold text-[10px] px-2 py-0.5 rounded-lg bg-slate-50">
                                {fmtDate(opp.closeDate)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>
                  );
                })}
                {cards.length === 0 && !isOver && (
                  <div className="h-20 rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center">
                    <span className="text-xs text-slate-300 font-medium">暂无商机</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v?.trim()));

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', filters],
    queryFn: () => oppsApi.list({ take: 100, ...activeFilters }),
  });

  const opps: Opportunity[] = data?.data ?? [];

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      oppsApi.update(id, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const handleStageChange = useCallback(
    (id: string, newStage: string) => {
      stageMutation.mutate({ id, stage: newStage });
    },
    [stageMutation],
  );
  const totalPipeline = opps.filter((o) => !o.isClosed).reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const totalWon = opps.filter((o) => o.isWon).reduce((s, o) => s + Number(o.amount ?? 0), 0);
  const openCount = opps.filter((o) => !o.isClosed).length;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <Target size={13} />
            <span>销售管理</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink">商机</h1>
          <p className="text-sm text-slate-400 font-medium mt-0.5">
            共 <span className="font-black text-ink">{opps.length}</span> 条商机，
            <span className="font-black text-ink">{openCount}</span> 条进行中
          </p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand hover:bg-brand-deep text-white h-11 px-6 font-bold shadow-xl shadow-brand/20 gap-2"
        >
          <Plus size={16} />
          新建商机
        </Button>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center text-brand shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">管道总金额</p>
            <p className="text-xl font-black text-white tabular-nums">{fmtMoney(totalPipeline)}</p>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">已赢单金额</p>
            <p className="text-xl font-black text-emerald-700 tabular-nums">{fmtMoney(totalWon)}</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
            <Columns3 size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">活跃商机数</p>
            <p className="text-xl font-black text-ink tabular-nums">{openCount}</p>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <FilterBar
        fields={OPP_FILTERS}
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      {/* ── Views ── */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <Tabs defaultValue="list">
          <CardHeader className="p-6 pb-0 border-b border-slate-50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-black text-ink">商机列表</CardTitle>
              <TabsList className="bg-slate-100 rounded-xl p-1 h-9">
                <TabsTrigger value="list" className="rounded-lg text-xs font-bold px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5">
                  <LayoutList size={13} /> 列表
                </TabsTrigger>
                <TabsTrigger value="kanban" className="rounded-lg text-xs font-bold px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm gap-1.5">
                  <Columns3 size={13} /> 看板
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-20 text-center text-slate-300 font-medium">加载中…</div>
            ) : (
              <>
                <TabsContent value="list" className="m-0">
                  <div className="p-6">
                    <DataTable
                      data={opps}
                      columns={[
                        { key: 'name', label: '商机名称', editable: false, render: (r) => <span className="font-bold text-ink hover:text-brand">{r.name}</span> },
                        { key: 'account', label: '客户', render: (r) => <span className="text-slate-500"><Building2 size={13} className="inline mr-1" />{r.account?.name ?? '—'}</span> },
                        { key: 'stage', label: '阶段', editable: true, type: 'select', options: STAGES.map(s => ({ value: s.value, label: s.label })), render: (r) => <Badge className={stageColor(r.stage)}>{stageZh(r.stage)}</Badge> },
                        { key: 'amount', label: '金额', editable: true, type: 'number', render: (r) => <span className="font-black">{fmtMoney(r.amount)}</span> },
                        { key: 'closeDate', label: '预计结案日期', editable: true, type: 'text', render: (r) => fmtDate(r.closeDate) },
                        { key: 'probability', label: '赢单概率', editable: true, type: 'number', render: (r) => r.probability != null ? `${r.probability}%` : '—' },
                      ]}
                      onRowClick={(row) => router.push(`/opportunities/${row.id}`)}
                      onUpdate={(id, field, value) => oppsApi.update(id, { [field]: value })}
                      onBulkUpdate={async (ids, field, value) => {
                        await Promise.all(ids.map((id) => oppsApi.update(id, { [field]: value })));
                        queryClient.invalidateQueries({ queryKey: ['opportunities'] });
                      }}
                      queryKey={['opportunities']}
                      loading={isLoading}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="kanban" className="m-0 p-6">
                  <KanbanView opps={opps} onStageChange={handleStageChange} />
                </TabsContent>
              </>
            )}
          </CardContent>
        </Tabs>
      </Card>

      <CreateRecordModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        objectApiName="Opportunity"
        onSuccess={() => {}}
      />
    </div>
  );
}