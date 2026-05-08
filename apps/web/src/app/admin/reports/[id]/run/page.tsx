'use client';
// ─── /admin/reports/:id/run ──────────────────────────────────────────────
// Run + display a saved report. Tabular by default; collapsible groups when
// groupBy is set. Export-CSV from rows. "Add to dashboard" modal too.

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  reportApi,
  dashboardApi,
  type RunReportResult,
  type ReportDef,
  type Dashboard,
  type Visualization,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Pencil, Download, Loader2, AlertTriangle, ChevronRight, ChevronDown,
  Plus, LayoutDashboard,
} from 'lucide-react';

const VIZ_OPTIONS: Array<{ value: Visualization; label: string }> = [
  { value: 'table', label: '表格' },
  { value: 'metric', label: '指标' },
  { value: 'bar', label: '柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
  { value: 'donut', label: '环形图' },
];

export default function ReportRunPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [addDashOpen, setAddDashOpen] = useState(false);

  const { data: report } = useQuery<ReportDef>({
    queryKey: ['report', id],
    queryFn: () => reportApi.get(id),
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery<RunReportResult>({
    queryKey: ['report-run', id],
    queryFn: () => reportApi.run(id),
  });

  function exportCsv() {
    if (!data) return;
    const cols = data.columns;
    const lines = [cols.join(',')];
    for (const r of data.rows) {
      lines.push(
        cols
          .map((c) => {
            const v = r[c];
            if (v == null) return '';
            const s = String(v).replace(/"/g, '""');
            return /[,"\n]/.test(s) ? `"${s}"` : s;
          })
          .join(','),
      );
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report?.name ?? 'report'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs font-bold text-slate-500"
            onClick={() => router.push('/admin/reports')}
          >
            <ArrowLeft size={12} /> 返回报表列表
          </Button>
          <h1 className="text-2xl font-black text-ink tracking-tight">{report?.name ?? '运行报表'}</h1>
          {report?.description ? (
            <p className="text-xs font-medium text-slate-500">{report.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => router.push(`/admin/reports/${id}/edit`)}
          >
            <Pencil size={14} /> 编辑
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : null}
            刷新
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={exportCsv}
            disabled={!data || data.rows.length === 0}
          >
            <Download size={14} /> 导出 CSV
          </Button>
          <Button
            className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            onClick={() => setAddDashOpen(true)}
          >
            <LayoutDashboard size={14} /> 添加到 Dashboard
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">运行失败：{(error as Error).message}</p>
            </div>
          ) : !data ? null : data.grouped && data.grouped.length > 0 ? (
            <GroupedView result={data} />
          ) : (
            <FlatView result={data} />
          )}
        </CardContent>
      </Card>

      {report && (
        <AddToDashboardDialog
          open={addDashOpen}
          onClose={() => setAddDashOpen(false)}
          report={report}
        />
      )}
    </div>
  );
}

function FlatView({ result }: { result: RunReportResult }) {
  const cols = result.columns;
  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="w-full">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {result.rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {cols.map((c) => (
                <td key={c} className="px-4 py-2 font-mono text-slate-700 whitespace-nowrap">
                  {r[c] == null ? '—' : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
          {result.rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-center text-xs text-slate-400 py-12">
                无数据
              </td>
            </tr>
          )}
        </tbody>
        {result.totals && Object.keys(result.totals).length > 0 && (
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={cols.length} className="px-4 py-3">
                <div className="flex flex-wrap gap-4 text-[11px] font-bold text-slate-700">
                  <span className="text-slate-400">合计：</span>
                  {Object.entries(result.totals).map(([k, v]) => (
                    <span key={k}>
                      {k}: <span className="font-mono text-ink">{v}</span>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GroupedView({ result }: { result: RunReportResult }) {
  const groups = result.grouped ?? [];
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const cols = result.columns;

  // Group rows by the same key shape: stringify keys for matching.
  const rowsByKey = useMemo(() => {
    const m = new Map<string, Record<string, unknown>[]>();
    for (const row of result.rows) {
      // Find matching group: serialize same keys as a group.
      // We don't know the groupBy fields directly so we group by the keys present in `grouped[].key`.
      const sample = groups[0]?.key ?? {};
      const k = JSON.stringify(Object.fromEntries(Object.keys(sample).map((kk) => [kk, row[kk]])));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(row);
    }
    return m;
  }, [result, groups]);

  return (
    <div className="divide-y divide-slate-100">
      {groups.map((g, idx) => {
        const isOpen = open[idx] ?? false;
        const keyStr = JSON.stringify(g.key);
        const rows = rowsByKey.get(keyStr) ?? [];
        return (
          <div key={idx}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [idx]: !isOpen }))}
              className="w-full flex items-center gap-3 px-6 py-3 hover:bg-slate-50 text-left"
            >
              {isOpen ? (
                <ChevronDown size={16} className="text-slate-400" />
              ) : (
                <ChevronRight size={16} className="text-slate-400" />
              )}
              <div className="flex-1 flex flex-wrap items-center gap-3 text-xs font-bold">
                {Object.entries(g.key).map(([k, v]) => (
                  <span key={k} className="text-slate-700">
                    <span className="text-slate-400">{k}:</span>{' '}
                    <span className="font-mono">{v == null ? '—' : String(v)}</span>
                  </span>
                ))}
              </div>
              <span className="text-[10px] font-black px-2 h-5 rounded-full bg-slate-100 text-slate-600 inline-flex items-center">
                {g.count} 行
              </span>
              <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-600 ml-4">
                {Object.entries(g.aggregates).map(([k, v]) => (
                  <span key={k}>
                    {k}: <span className="font-mono text-ink">{v}</span>
                  </span>
                ))}
              </div>
            </button>
            {isOpen && (
              <div className="bg-slate-50/40 px-6 py-3 overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th
                          key={c}
                          className="px-3 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c} className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap">
                            {r[c] == null ? '—' : String(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {result.totals && Object.keys(result.totals).length > 0 && (
        <div className="px-6 py-3 bg-slate-50 flex flex-wrap gap-4 text-xs font-bold text-slate-700">
          <span className="text-slate-400">总计：</span>
          {Object.entries(result.totals).map(([k, v]) => (
            <span key={k}>
              {k}: <span className="font-mono text-ink">{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AddToDashboardDialog({
  open,
  onClose,
  report,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDef;
}) {
  const qc = useQueryClient();
  const [dashboardId, setDashboardId] = useState<string>('');
  const [title, setTitle] = useState(report.name);
  const [viz, setViz] = useState<Visualization>('table');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newDashName, setNewDashName] = useState('');

  const { data: dashboards } = useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => dashboardApi.list(),
    enabled: open,
    staleTime: 30_000,
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      let targetId = dashboardId;
      if (creatingNew) {
        const d = await dashboardApi.create({ name: newDashName.trim() || '新 Dashboard' });
        targetId = d.id;
      }
      if (!targetId) throw new Error('请选择 Dashboard');
      await dashboardApi.addComponent(targetId, {
        reportId: report.id,
        visualization: viz,
        title: title.trim() || report.name,
      });
      return targetId;
    },
    onSuccess: (targetId) => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      qc.invalidateQueries({ queryKey: ['dashboard', targetId] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">添加到 Dashboard</DialogTitle>
          <DialogDescription>把当前报表作为组件加到一个 Dashboard 上</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">组件标题</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">可视化方式</label>
            <select
              value={viz}
              onChange={(e) => setViz(e.target.value as Visualization)}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
            >
              {VIZ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">目标 Dashboard</label>
              <button
                type="button"
                className="text-[11px] font-bold text-slate-700 underline"
                onClick={() => setCreatingNew((v) => !v)}
              >
                {creatingNew ? '选择已有' : '+ 新建'}
              </button>
            </div>
            {creatingNew ? (
              <Input
                value={newDashName}
                onChange={(e) => setNewDashName(e.target.value)}
                placeholder="新 Dashboard 名称"
                className="h-10 rounded-xl"
              />
            ) : (
              <select
                value={dashboardId}
                onChange={(e) => setDashboardId(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs"
              >
                <option value="">— 选择 —</option>
                {(dashboards ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
          {submitMut.isError && (
            <div className="text-xs font-bold text-red-600">
              失败：{(submitMut.error as Error)?.message}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>取消</Button>
          <Button
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            disabled={submitMut.isPending}
            onClick={() => submitMut.mutate()}
          >
            {submitMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
