'use client';
// ─── /admin/me/permissions (Wave 20d) ─────────────────────────────────────
// Self-debug: render the resolved flat permission array for the current user.
// Sortable + searchable. Provenance tags shown if backend provides them; for
// now backend only returns `flat[]`, so we simply group by inferred bucket.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mePermissionsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowDownAZ, ArrowUpAZ, KeyRound, Loader2, RefreshCw, Search, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortDir = 'asc' | 'desc';

export default function MyPermissionsPage() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['me-permissions'],
    queryFn: () => mePermissionsApi.resolved(),
  });

  const [q, setQ] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const list = useMemo(() => {
    const flat = data?.flat ?? [];
    const filtered = q.trim()
      ? flat.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()))
      : flat;
    const sorted = [...filtered].sort((a, b) => (sortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)));
    return sorted;
  }, [data, q, sortDir]);

  // Best-effort provenance bucket (backend doesn't return source today).
  function bucket(code: string): { tag: string; tone: string } {
    if (code === 'admin.*' || code.startsWith('admin') || code.startsWith('manage_')) return { tag: '系统/Admin', tone: 'bg-amber-50 text-amber-700' };
    if (code.includes('.') && code.split('.').length >= 3) return { tag: '字段权限', tone: 'bg-emerald-50 text-emerald-700' };
    if (code.includes('.')) return { tag: '对象权限', tone: 'bg-blue-50 text-blue-700' };
    return { tag: '系统权限', tone: 'bg-violet-50 text-violet-700' };
  }

  return (
    <div className="p-8 space-y-6 max-w-[1100px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <KeyRound size={20} />
            </div>
            我的权限
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            实时合并 Profile（基线）+ 所有未过期 Permission Set（叠加）后的扁平权限。仅你本人可见。
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl font-bold gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新
        </Button>
      </div>

      {data?.legacyFallback && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-2">
          <Shield size={16} className="text-amber-600" />
          <span className="text-xs font-bold text-amber-800">
            当前用户尚未分配 Profile，权限正在使用旧 Role 表回退（legacy fallback）。
          </span>
        </div>
      )}

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索权限码 (例如 lead.read)"
                className="h-9 pl-9 rounded-xl"
              />
            </div>
            <Button
              variant="outline"
              className="h-9 rounded-xl gap-1 font-bold"
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            >
              {sortDir === 'asc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
              排序 {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
            </Button>
            <span className="text-xs font-bold text-slate-400 ml-auto">
              共 {data?.flat.length ?? 0} 条 · 显示 {list.length} 条
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-12 text-center text-sm font-bold text-red-600">
              加载失败：{(error as Error).message}
            </div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center text-sm font-bold text-slate-400">没有匹配的权限</div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden bg-white">
              {list.map((p) => {
                const b = bucket(p);
                return (
                  <li key={p} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/60">
                    <span className="font-mono text-xs font-bold text-slate-700">{p}</span>
                    <span className={cn('px-2 h-5 inline-flex items-center rounded-full text-[10px] font-black', b.tone)}>
                      {b.tag}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Raw resolved structure for power users */}
      {data && (
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-sm font-black text-ink">原始结构（合并后）</h2>
            <pre className="text-[11px] font-mono bg-slate-50 rounded-2xl p-3 overflow-x-auto leading-relaxed">
{JSON.stringify({ objectCrud: data.objectCrud, fieldPerms: data.fieldPerms, systemPerms: data.systemPerms, legacyFallback: data.legacyFallback }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
