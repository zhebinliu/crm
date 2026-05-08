'use client';
// ─── Inline minimal SVG charts ───────────────────────────────────────────
// Tiny dependency-free renderers for table / metric / bar / line / pie / donut.
// Designed for the Dashboards admin UI, where Recharts isn't installed.

import type { RunReportResult, Visualization } from '@/lib/api';

interface ComponentResult extends Partial<RunReportResult> {
  error?: string;
}

const PALETTE = [
  '#0f172a', '#2563eb', '#10b981', '#f59e0b', '#db2777', '#7c3aed',
  '#0891b2', '#dc2626', '#84cc16', '#a855f7', '#f43f5e', '#14b8a6',
];

export function ComponentRenderer({
  result,
  visualization,
}: {
  result: ComponentResult;
  visualization: Visualization;
}) {
  if (result.error) {
    return <div className="text-xs font-bold text-red-500 p-4">{result.error}</div>;
  }
  if (!result.columns || !result.rows) {
    return <div className="text-xs text-slate-400 p-4">无数据</div>;
  }

  switch (visualization) {
    case 'metric':
      return <MetricView result={result as RunReportResult} />;
    case 'bar':
      return <BarChart result={result as RunReportResult} />;
    case 'line':
      return <LineChart result={result as RunReportResult} />;
    case 'pie':
      return <PieChartSvg result={result as RunReportResult} donut={false} />;
    case 'donut':
      return <PieChartSvg result={result as RunReportResult} donut={true} />;
    case 'table':
    default:
      return <TableView result={result as RunReportResult} />;
  }
}

function TableView({ result }: { result: RunReportResult }) {
  const cols = result.columns;
  const rows = result.rows.slice(0, 50);
  return (
    <div className="overflow-auto max-h-72">
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
            <tr key={i} className="hover:bg-slate-50/40">
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                  {r[c] == null ? '—' : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-center text-xs text-slate-400 py-6">无数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricView({ result }: { result: RunReportResult }) {
  // Prefer totals; fall back to row count.
  const totalEntries = Object.entries(result.totals ?? {});
  if (totalEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="text-5xl font-black text-ink tabular-nums">{result.rows.length}</div>
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-2">行数</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
      {totalEntries.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{k}</div>
          <div className="text-3xl font-black text-ink tabular-nums mt-1">{formatNumber(v)}</div>
        </div>
      ))}
    </div>
  );
}

function deriveSeries(result: RunReportResult): { label: string; value: number }[] {
  // Prefer grouped data (groupBy + aggregates).
  if (result.grouped && result.grouped.length > 0) {
    const aggKey = Object.keys(result.grouped[0]?.aggregates ?? {})[0];
    return result.grouped.map((g) => ({
      label: Object.values(g.key).map((v) => (v == null ? '—' : String(v))).join(' / '),
      value: aggKey ? Number(g.aggregates[aggKey]) || 0 : g.count,
    }));
  }
  // Otherwise use first numeric column vs first non-numeric column.
  const cols = result.columns;
  if (cols.length === 0 || result.rows.length === 0) return [];
  const numericCol =
    cols.find((c) => result.rows.some((r) => typeof r[c] === 'number')) ?? cols[1] ?? cols[0];
  const labelCol = cols.find((c) => c !== numericCol) ?? cols[0];
  return result.rows.slice(0, 20).map((r) => ({
    label: r[labelCol] == null ? '—' : String(r[labelCol]),
    value: Number(r[numericCol]) || 0,
  }));
}

function BarChart({ result }: { result: RunReportResult }) {
  const data = deriveSeries(result);
  if (data.length === 0) return <div className="p-6 text-xs text-slate-400 text-center">无数据</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="p-4 space-y-1.5">
      {data.map((d, i) => {
        const w = (d.value / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-32 truncate text-slate-600 font-mono" title={d.label}>{d.label}</div>
            <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
              <div
                className="h-full rounded"
                style={{ width: `${w}%`, background: PALETTE[i % PALETTE.length] }}
              />
            </div>
            <div className="w-16 text-right font-mono font-bold text-ink tabular-nums">
              {formatNumber(d.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ result }: { result: RunReportResult }) {
  const data = deriveSeries(result);
  if (data.length < 2) return <BarChart result={result} />;
  const W = 480;
  const H = 180;
  const PAD = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const step = (W - PAD * 2) / (data.length - 1);
  const pts = data.map((d, i) => {
    const x = PAD + i * step;
    const y = PAD + (1 - (d.value - min) / range) * (H - PAD * 2);
    return [x, y] as [number, number];
  });
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  return (
    <div className="p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e2e8f0" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e2e8f0" />
        <path d={path} fill="none" stroke={PALETTE[1]} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={PALETTE[1]} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1 px-6">
        <span className="truncate max-w-[60px]">{data[0]?.label}</span>
        <span className="truncate max-w-[60px] text-right">{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function PieChartSvg({ result, donut }: { result: RunReportResult; donut: boolean }) {
  const data = deriveSeries(result).filter((d) => d.value > 0).slice(0, 8);
  if (data.length === 0) return <div className="p-6 text-xs text-slate-400 text-center">无数据</div>;
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = 100, cy = 100, r = 80, ir = donut ? 50 : 0;

  let acc = 0;
  const arcs = data.map((d, i) => {
    const startAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += d.value;
    const endAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    let path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
    if (donut) {
      const ix1 = cx + ir * Math.cos(startAngle), iy1 = cy + ir * Math.sin(startAngle);
      const ix2 = cx + ir * Math.cos(endAngle), iy2 = cy + ir * Math.sin(endAngle);
      path = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large} 0 ${ix1},${iy1} Z`;
    }
    return { path, color: PALETTE[i % PALETTE.length], label: d.label, value: d.value };
  });

  return (
    <div className="p-4 flex items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0">
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color} />
        ))}
      </svg>
      <div className="flex-1 space-y-1.5 max-h-44 overflow-auto">
        {arcs.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded shrink-0" style={{ background: a.color }} />
            <span className="flex-1 truncate text-slate-600 font-mono" title={a.label}>{a.label}</span>
            <span className="font-mono font-bold text-ink tabular-nums">{formatNumber(a.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
