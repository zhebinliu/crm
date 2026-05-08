'use client';
// ─── /admin/persons ──────────────────────────────────────────────────────
// Customer 360 list — search across the unified Person identity graph.
// Each row links to /admin/persons/:id for the merged 360° view.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personApi } from '@/lib/api';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  UserSearch, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Mail, Phone, Users as UsersIcon, AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react';

interface Person {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  leadCount: number;
  contactCount: number;
  campaignCount: number;
  caseCount: number;
  opportunityCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DedupeCandidate {
  id: string;
  sourceType: string;
  sourceId: string;
  candidatePersonId: string;
  score: number;
  status: string;
  createdAt: string;
}

const PAGE_SIZE = 50;

export default function PersonListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [skip, setSkip] = useState(0);
  const [dedupeOpen, setDedupeOpen] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery<{ data: Person[]; total: number }>({
    queryKey: ['persons', search, skip],
    queryFn: () => personApi.list({ search: search || undefined, skip, take: PAGE_SIZE }),
    staleTime: 15_000,
  });

  const { data: dedupeData } = useQuery<DedupeCandidate[]>({
    queryKey: ['persons-dedupe-candidates', 'pending'],
    queryFn: () => personApi.listDedupeCandidates('pending', 100),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pendingCount = (dedupeData ?? []).length;

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const next = searchInput.trim();
    setSearch(next);
    setSkip(0);
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set('search', next);
    else sp.delete('search');
    router.replace(`/admin/persons${sp.toString() ? `?${sp}` : ''}`);
  }

  function fullName(p: Person): string {
    return [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <UserSearch size={20} />
            </div>
            Customer 360 / 人员
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            统一身份视图：一个 Person 聚合所有线索 / 联系人 / 服务工单 / 营销互动
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => setDedupeOpen(true)}
          >
            <AlertCircle size={14} />
            Dedupe 待办
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-black">
                {pendingCount}
              </span>
            )}
          </Button>
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
      </div>

      {/* Search */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <form onSubmit={applySearch} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                搜索 邮箱 / 电话 / 姓名
              </label>
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="liu@zheb.in / 13800138000 / 张三"
                className="h-10 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-10 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-1.5">
              <Search size={14} /> 搜索
            </Button>
            {search && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl font-bold"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setSkip(0);
                  router.replace('/admin/persons');
                }}
              >
                重置
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <XCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <UserSearch size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">
                {search ? '没有匹配的 Person' : '尚未生成任何 Person 记录'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">姓名</th>
                  <th className="px-6 py-3 text-left">主邮箱</th>
                  <th className="px-6 py-3 text-left">主电话</th>
                  <th className="px-6 py-3 text-right">关联线索</th>
                  <th className="px-6 py-3 text-right">关联联系人</th>
                  <th className="px-6 py-3 text-right">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/admin/persons/${p.id}`)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-black text-ink">{fullName(p)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {p.primaryEmail ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={12} className="text-slate-400" />
                          {p.primaryEmail}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600 font-mono">
                      {p.primaryPhone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400" />
                          {p.primaryPhone}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums">
                      <span className={cn(
                        'inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full',
                        p.leadCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400',
                      )}>
                        {p.leadCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums">
                      <span className={cn(
                        'inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full',
                        p.contactCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400',
                      )}>
                        {p.contactCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>第 {skip + 1} – {Math.min(skip + PAGE_SIZE, total)} 条 / 共 {total} 条</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl gap-1"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            >
              <ChevronLeft size={12} /> 上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl gap-1"
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
            >
              下一页 <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* Dedupe modal */}
      <DedupeCandidatesDialog open={dedupeOpen} onOpenChange={setDedupeOpen} />
    </div>
  );
}

// ─── Dedupe candidate review modal ─────────────────────────────────────────

function DedupeCandidatesDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DedupeCandidate[]>({
    queryKey: ['persons-dedupe-candidates', 'pending', 'modal'],
    queryFn: () => personApi.listDedupeCandidates('pending', 200),
    enabled: open,
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'confirm_merge' | 'reject' }) =>
      personApi.resolveDedupeCandidate(id, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['persons-dedupe-candidates'] });
      qc.invalidateQueries({ queryKey: ['persons'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <AlertCircle size={20} className="text-amber-500" />
            待人工裁决的 Dedupe 候选
          </DialogTitle>
          <DialogDescription>
            身份解析规则发现下面这些记录可能与已有 Person 重复，请人工确认是否合并。
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-300 mb-3" />
            <p className="text-base font-black text-slate-400">没有待处理的候选</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
            {(data ?? []).map((c) => (
              <li key={c.id} className="py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-slate-100 text-slate-600 inline-flex items-center uppercase">
                      {c.sourceType}
                    </span>
                    <span className="text-xs font-mono text-slate-400 truncate">{c.sourceId}</span>
                    <span className="text-xs text-slate-400">→</span>
                    <span className="text-xs font-mono text-slate-600 truncate">{c.candidatePersonId}</span>
                    <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-violet-50 text-violet-700 inline-flex items-center">
                      置信度 {Math.round(c.score * 100)}%
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 mt-1">{fmtDate(c.createdAt, 'YYYY-MM-DD HH:mm')}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-bold"
                    onClick={() => resolveMut.mutate({ id: c.id, decision: 'confirm_merge' })}
                    disabled={resolveMut.isPending}
                  >
                    <CheckCircle2 size={12} /> 合并
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl gap-1 font-bold"
                    onClick={() => resolveMut.mutate({ id: c.id, decision: 'reject' })}
                    disabled={resolveMut.isPending}
                  >
                    <XCircle size={12} /> 驳回
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused-import warnings for icons reserved for callouts
void UsersIcon;
