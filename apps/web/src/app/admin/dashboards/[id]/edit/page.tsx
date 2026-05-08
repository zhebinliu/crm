'use client';
// ─── /admin/dashboards/:id/edit ─────────────────────────────────────────
// Edit mode — reorder components (up/down), add/remove components, rename
// Dashboard, save layout via PATCH/PUT (we just persist `layout` order).

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dashboardApi,
  reportApi,
  type Dashboard,
  type DashboardComponent,
  type ReportDef,
  type Visualization,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Save, Loader2, AlertTriangle,
} from 'lucide-react';

const VIZ_OPTIONS: Array<{ value: Visualization; label: string }> = [
  { value: 'table', label: '表格' },
  { value: 'metric', label: '指标' },
  { value: 'bar', label: '柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
  { value: 'donut', label: '环形图' },
];

export default function DashboardEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const { data: dash, isLoading, error } = useQuery<Dashboard>({
    queryKey: ['dashboard', id],
    queryFn: () => dashboardApi.get(id),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState<string[]>([]); // componentIds in display order
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!dash) return;
    setName(dash.name);
    setDescription(dash.description ?? '');
    const layoutMap = new Map((dash.layout ?? []).map((l) => [l.componentId, l]));
    const sorted = [...(dash.components ?? [])].sort((a, b) => {
      const la = layoutMap.get(a.id);
      const lb = layoutMap.get(b.id);
      if (la && lb) return la.y - lb.y || la.x - lb.x;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    setOrder(sorted.map((c) => c.id));
  }, [dash]);

  const compsById = useMemo(() => {
    const m = new Map<string, DashboardComponent>();
    for (const c of dash?.components ?? []) m.set(c.id, c);
    return m;
  }, [dash]);

  const saveMut = useMutation({
    mutationFn: () => {
      const layout = order.map((cid, idx) => ({ componentId: cid, x: 0, y: idx, w: 6, h: 4 }));
      return dashboardApi.update(id, {
        name: name.trim(),
        description: description.trim() || null,
        layout,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', id] });
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      router.push(`/admin/dashboards/${id}`);
    },
  });

  const removeCompMut = useMutation({
    mutationFn: (cid: string) => dashboardApi.removeComponent(id, cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', id] });
    },
  });

  function move(idx: number, dir: -1 | 1) {
    setOrder((o) => {
      const next = [...o];
      const ni = idx + dir;
      if (ni < 0 || ni >= next.length) return o;
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs font-bold text-slate-500"
            onClick={() => router.push(`/admin/dashboards/${id}`)}
          >
            <ArrowLeft size={12} /> 返回查看
          </Button>
          <h1 className="text-2xl font-black text-ink tracking-tight">编辑 Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold"
            onClick={() => router.push(`/admin/dashboards/${id}`)}
          >
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

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-ink">组件（{order.length}）</h3>
            <Button
              size="sm"
              className="h-8 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={12} /> 添加组件
            </Button>
          </div>
          {order.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm font-bold text-slate-400">还没有组件，点击右上角添加一个</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {order.map((cid, idx) => {
                const c = compsById.get(cid);
                if (!c) return null;
                return (
                  <li key={cid} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-400 w-6 tabular-nums">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-ink truncate">{c.title}</div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {c.visualization} · report:{c.reportId}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 rounded-lg"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ArrowUp size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 rounded-lg"
                      onClick={() => move(idx, 1)}
                      disabled={idx === order.length - 1}
                    >
                      <ArrowDown size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg gap-1 font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        if (window.confirm('从 Dashboard 移除该组件？')) {
                          removeCompMut.mutate(cid);
                          setOrder((o) => o.filter((x) => x !== cid));
                        }
                      }}
                    >
                      <Trash2 size={12} /> 移除
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddComponentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        dashboardId={id}
        onAdded={(newId) => setOrder((o) => [...o, newId])}
      />
    </div>
  );
}

function AddComponentDialog({
  open,
  onClose,
  dashboardId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  onAdded: (newComponentId: string) => void;
}) {
  const qc = useQueryClient();
  const [reportId, setReportId] = useState('');
  const [title, setTitle] = useState('');
  const [viz, setViz] = useState<Visualization>('table');

  const { data: reports } = useQuery<ReportDef[]>({
    queryKey: ['reports'],
    queryFn: () => reportApi.list(),
    enabled: open,
    staleTime: 30_000,
  });

  const addMut = useMutation({
    mutationFn: () =>
      dashboardApi.addComponent(dashboardId, {
        reportId,
        visualization: viz,
        title: title.trim() || (reports ?? []).find((r) => r.id === reportId)?.name || 'Component',
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      onAdded(c.id);
      setReportId('');
      setTitle('');
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black">添加组件</DialogTitle>
          <DialogDescription>把一个已有报表作为组件添加到 Dashboard</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">报表</label>
            <select
              value={reportId}
              onChange={(e) => {
                setReportId(e.target.value);
                const r = (reports ?? []).find((x) => x.id === e.target.value);
                if (r && !title) setTitle(r.name);
              }}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs"
            >
              <option value="">— 选择 —</option>
              {(reports ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
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
          {addMut.isError && (
            <div className="text-xs font-bold text-red-600">
              添加失败：{(addMut.error as Error)?.message}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>取消</Button>
          <Button
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold gap-2"
            disabled={!reportId || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
