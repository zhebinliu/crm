'use client';
// ─── /admin/reports/:id/edit ─────────────────────────────────────────────
// Builder — pick columns, filters, group-by, aggregates, sort, limit; right
// pane shows live preview from /reports/run-adhoc on debounce.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  reportApi,
  type ReportConfig,
  type ReportFilter,
  type ReportFilterOp,
  type ReportAggregate,
  type ReportAggregateType,
  type RunReportResult,
  type ReportType,
  type ReportDef,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Save, ArrowLeft, Plus, Trash2, Loader2, Play, AlertTriangle, X,
} from 'lucide-react';

const FILTER_OPS: Array<{ value: ReportFilterOp; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'in', label: 'in' },
  { value: 'nin', label: 'not in' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];

const AGG_TYPES: Array<{ value: ReportAggregateType; label: string }> = [
  { value: 'sum', label: 'SUM' },
  { value: 'avg', label: 'AVG' },
  { value: 'count', label: 'COUNT' },
  { value: 'min', label: 'MIN' },
  { value: 'max', label: 'MAX' },
];

export default function ReportEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: report, isLoading: loadingReport, error: reportErr } = useQuery<ReportDef>({
    queryKey: ['report', id],
    queryFn: () => reportApi.get(id),
  });

  const { data: types } = useQuery<ReportType[]>({
    queryKey: ['report-types'],
    queryFn: () => reportApi.listTypes(),
    staleTime: 60_000,
  });

  const reportType = useMemo(
    () => (types ?? []).find((t) => t.id === report?.reportTypeId),
    [types, report],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<ReportConfig>({ columns: [] });

  useEffect(() => {
    if (!report) return;
    setName(report.name);
    setDescription(report.description ?? '');
    setConfig({
      columns: report.config?.columns ?? [],
      filters: report.config?.filters ?? [],
      groupBy: report.config?.groupBy ?? [],
      aggregates: report.config?.aggregates ?? [],
      sortBy: report.config?.sortBy ?? [],
      limit: report.config?.limit,
    });
  }, [report]);

  const availableColumns = reportType?.availableColumns ?? [];

  // ── Live preview (debounced) ────────────────────────────────────────────
  const [preview, setPreview] = useState<RunReportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportType?.baseObject || (config.columns ?? []).length === 0) {
      setPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError(null);
      try {
        const r = await reportApi.runAdHoc(reportType.baseObject, config);
        setPreview(r);
      } catch (e) {
        setPreviewError((e as Error).message);
      } finally {
        setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [reportType?.baseObject, JSON.stringify(config)]);

  const saveMut = useMutation({
    mutationFn: () =>
      reportApi.update(id, {
        name: name.trim(),
        description: description.trim() || null,
        config,
      }),
    onSuccess: () => router.push('/admin/reports'),
  });

  if (loadingReport) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (reportErr) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">加载失败：{(reportErr as Error).message}</p>
      </div>
    );
  }

  function toggleColumn(col: string) {
    setConfig((c) => {
      const cols = c.columns.includes(col)
        ? c.columns.filter((x) => x !== col)
        : [...c.columns, col];
      return { ...c, columns: cols };
    });
  }

  function addFilter() {
    setConfig((c) => ({
      ...c,
      filters: [...(c.filters ?? []), { field: availableColumns[0] ?? '', op: 'eq', value: '' }],
    }));
  }
  function updateFilter(i: number, patch: Partial<ReportFilter>) {
    setConfig((c) => {
      const next = [...(c.filters ?? [])];
      next[i] = { ...next[i], ...patch };
      return { ...c, filters: next };
    });
  }
  function removeFilter(i: number) {
    setConfig((c) => ({ ...c, filters: (c.filters ?? []).filter((_, idx) => idx !== i) }));
  }

  function addAggregate() {
    setConfig((c) => ({
      ...c,
      aggregates: [...(c.aggregates ?? []), { type: 'count' }],
    }));
  }
  function updateAggregate(i: number, patch: Partial<ReportAggregate>) {
    setConfig((c) => {
      const next = [...(c.aggregates ?? [])];
      next[i] = { ...next[i], ...patch };
      return { ...c, aggregates: next };
    });
  }
  function removeAggregate(i: number) {
    setConfig((c) => ({ ...c, aggregates: (c.aggregates ?? []).filter((_, idx) => idx !== i) }));
  }

  function setSort(field: string, direction: 'asc' | 'desc') {
    setConfig((c) => ({ ...c, sortBy: field ? [{ field, direction }] : [] }));
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
          <h1 className="text-2xl font-black text-ink tracking-tight">编辑报表</h1>
          <p className="text-xs font-medium text-slate-500">
            基础对象：<span className="font-mono font-bold text-slate-700">{reportType?.baseObject ?? '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => router.push('/admin/reports')}>
            取消
          </Button>
          <Button
            className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </Button>
        </div>
      </div>

      {saveMut.isError && (
        <div className="rounded-xl bg-red-50 text-red-700 text-xs font-bold px-4 py-3">
          保存失败：{(saveMut.error as Error)?.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: builder */}
        <div className="space-y-6">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">描述</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-10 rounded-xl"
                  placeholder="可选"
                />
              </div>
            </CardContent>
          </Card>

          {/* Columns */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ink">列</h3>
                <span className="text-[10px] font-bold text-slate-400">
                  已选 {config.columns.length} / {availableColumns.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-auto">
                {availableColumns.map((col) => {
                  const checked = config.columns.includes(col);
                  return (
                    <label
                      key={col}
                      className={
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-mono transition-all ' +
                        (checked
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white hover:border-slate-300')
                      }
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => toggleColumn(col)}
                      />
                      {col}
                    </label>
                  );
                })}
                {availableColumns.length === 0 && (
                  <div className="col-span-2 text-xs text-slate-400 py-6 text-center">无可用列</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ink">筛选</h3>
                <Button size="sm" variant="outline" className="h-8 rounded-xl gap-1 font-bold" onClick={addFilter}>
                  <Plus size={12} /> 新增筛选
                </Button>
              </div>
              <div className="space-y-2">
                {(config.filters ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={f.field}
                      onChange={(e) => updateFilter(i, { field: e.target.value })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-mono flex-1"
                    >
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => updateFilter(i, { op: e.target.value as ReportFilterOp })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-bold w-32"
                    >
                      {FILTER_OPS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {f.op !== 'isNull' && f.op !== 'isNotNull' && (
                      <Input
                        value={String(f.value ?? '')}
                        onChange={(e) => {
                          const raw = e.target.value;
                          // convert to array if op is in/nin and contains comma
                          if ((f.op === 'in' || f.op === 'nin') && raw.includes(',')) {
                            updateFilter(i, { value: raw.split(',').map((s) => s.trim()) });
                          } else {
                            updateFilter(i, { value: raw });
                          }
                        }}
                        className="h-9 rounded-lg flex-1 text-xs"
                        placeholder={f.op === 'in' || f.op === 'nin' ? '逗号分隔' : '值'}
                      />
                    )}
                    <button
                      onClick={() => removeFilter(i)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {(config.filters ?? []).length === 0 && (
                  <div className="text-xs text-slate-400 py-3 text-center">没有筛选条件</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Group by + aggregates */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-black text-ink">分组与聚合</h3>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">分组列</label>
                <select
                  value={(config.groupBy ?? [])[0] ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, groupBy: e.target.value ? [e.target.value] : [] }))
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-mono"
                >
                  <option value="">无分组</option>
                  {availableColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">聚合</label>
                  <Button size="sm" variant="outline" className="h-7 rounded-lg gap-1 text-[11px] font-bold" onClick={addAggregate}>
                    <Plus size={10} /> 新增
                  </Button>
                </div>
                {(config.aggregates ?? []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={a.type}
                      onChange={(e) => updateAggregate(i, { type: e.target.value as ReportAggregateType })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-bold w-24"
                    >
                      {AGG_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <select
                      value={a.field ?? ''}
                      onChange={(e) => updateAggregate(i, { field: e.target.value || undefined })}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-mono flex-1"
                    >
                      <option value="">{a.type === 'count' ? '* (默认)' : '— 选择字段 —'}</option>
                      {availableColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <Input
                      value={a.alias ?? ''}
                      onChange={(e) => updateAggregate(i, { alias: e.target.value || undefined })}
                      placeholder="别名"
                      className="h-9 rounded-lg w-28 text-xs font-mono"
                    />
                    <button
                      onClick={() => removeAggregate(i)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sort + limit */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-black text-ink">排序与限制</h3>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={(config.sortBy ?? [])[0]?.field ?? ''}
                  onChange={(e) =>
                    setSort(e.target.value, (config.sortBy ?? [])[0]?.direction ?? 'asc')
                  }
                  className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-mono col-span-2"
                >
                  <option value="">无排序</option>
                  {availableColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={(config.sortBy ?? [])[0]?.direction ?? 'asc'}
                  onChange={(e) => {
                    const f = (config.sortBy ?? [])[0]?.field ?? '';
                    if (f) setSort(f, e.target.value as 'asc' | 'desc');
                  }}
                  className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">最大行数</label>
                <Input
                  type="number"
                  value={config.limit ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      limit: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="h-10 rounded-xl"
                  placeholder="例如 1000"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: live preview */}
        <div>
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white sticky top-6">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ink flex items-center gap-2">
                  <Play size={14} /> 实时预览
                </h3>
                {previewing && <Loader2 size={14} className="animate-spin text-slate-400" />}
              </div>
              {previewError ? (
                <div className="rounded-xl bg-red-50 text-red-700 text-xs font-bold px-4 py-3">
                  {previewError}
                </div>
              ) : !preview ? (
                <div className="text-xs text-slate-400 py-12 text-center">
                  请先选择至少一列
                </div>
              ) : preview.rows.length === 0 ? (
                <div className="text-xs text-slate-400 py-12 text-center">
                  本配置无匹配数据
                </div>
              ) : (
                <PreviewTable result={preview} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PreviewTable({ result }: { result: RunReportResult }) {
  const cols = result.columns;
  const rows = result.rows.slice(0, 30);
  return (
    <div className="overflow-auto max-h-[60vh] rounded-xl border border-slate-200">
      <table className="w-full">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap max-w-[160px] truncate">
                  {r[c] == null ? '—' : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.totals && Object.keys(result.totals).length > 0 && (
        <div className="px-4 py-2 border-t bg-slate-50 text-[11px] font-bold text-slate-600 flex flex-wrap gap-3">
          {Object.entries(result.totals).map(([k, v]) => (
            <span key={k}>
              {k}: <span className="font-mono">{v}</span>
            </span>
          ))}
        </div>
      )}
      {result.rows.length > rows.length && (
        <div className="px-4 py-2 text-[11px] text-slate-400 border-t">
          预览前 30 行，总共 {result.rows.length} 行
        </div>
      )}
    </div>
  );
}
