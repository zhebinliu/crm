'use client';
// ─── /admin/dashboards/:id ──────────────────────────────────────────────
// Renderer — fetches /dashboards/:id and /dashboards/:id/run, renders each
// component using ComponentRenderer (table / metric / bar / line / pie / donut).

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  dashboardApi,
  type Dashboard,
  type RunReportResult,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { ComponentRenderer } from '@/components/dashboards-chart';

const VIZ_LABEL: Record<string, string> = {
  table: '表格',
  metric: '指标',
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  donut: '环形图',
};

export default function DashboardViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: dash, isLoading: loadingDash, error: dashErr } = useQuery<Dashboard>({
    queryKey: ['dashboard', id],
    queryFn: () => dashboardApi.get(id),
  });

  const {
    data: runResult,
    isFetching,
    refetch,
    error: runErr,
  } = useQuery<{
    dashboardId: string;
    components: Record<string, RunReportResult | { error: string }>;
  }>({
    queryKey: ['dashboard-run', id],
    queryFn: () => dashboardApi.run(id),
  });

  const components = useMemo(() => {
    if (!dash?.components) return [];
    const layoutMap = new Map(
      (dash.layout ?? []).map((l) => [l.componentId, l]),
    );
    return [...dash.components].sort((a, b) => {
      const la = layoutMap.get(a.id);
      const lb = layoutMap.get(b.id);
      if (la && lb) return la.y - lb.y || la.x - lb.x;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [dash]);

  if (loadingDash) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (dashErr) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">加载失败：{(dashErr as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs font-bold text-slate-500"
            onClick={() => router.push('/admin/dashboards')}
          >
            <ArrowLeft size={12} /> 返回 Dashboard 列表
          </Button>
          <h1 className="text-2xl font-black text-ink tracking-tight">{dash?.name}</h1>
          {dash?.description ? (
            <p className="text-xs font-medium text-slate-500">{dash.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          <Button
            className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            onClick={() => router.push(`/admin/dashboards/${id}/edit`)}
          >
            <Pencil size={14} /> 编辑
          </Button>
        </div>
      </div>

      {runErr && (
        <div className="rounded-xl bg-red-50 text-red-700 text-xs font-bold px-4 py-3">
          运行 Dashboard 失败：{(runErr as Error)?.message}
        </div>
      )}

      {components.length === 0 ? (
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardContent className="p-20 text-center">
            <div className="text-5xl mb-3">🪄</div>
            <p className="text-base font-black text-slate-400 mb-3">这个 Dashboard 还没有组件</p>
            <Button
              className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
              onClick={() => router.push(`/admin/dashboards/${id}/edit`)}
            >
              <Pencil size={14} /> 去添加组件
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {components.map((c) => {
            const r = runResult?.components?.[c.id];
            return (
              <Card
                key={c.id}
                className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden"
              >
                <CardContent className="p-0">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-ink">{c.title}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                        {VIZ_LABEL[c.visualization] ?? c.visualization}
                      </p>
                    </div>
                  </div>
                  <div>
                    {!r ? (
                      <div className="p-12 text-center">
                        <Loader2 size={16} className="animate-spin mx-auto text-slate-300" />
                      </div>
                    ) : (
                      <ComponentRenderer
                        result={r as RunReportResult & { error?: string }}
                        visualization={c.visualization}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
