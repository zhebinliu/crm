'use client';
// ─── /admin/audit-log ─────────────────────────────────────────────────────
// Read-only viewer over AuditLog. Filters by record type / action / actor /
// date range / ID search. Each row expands to show the changes diff.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  History, Search, Filter, ChevronDown, ChevronRight, Loader2,
  RefreshCw, User as UserIcon, ChevronLeft,
} from 'lucide-react';

interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  recordType: string;
  recordId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditRow[];
  total: number;
  actorMap: Record<string, { displayName: string; email: string }>;
}

const ACTION_ZH: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  convert: '转化',
  approve: '审批通过',
  reject: '审批拒绝',
  recall: '撤回',
};

const RECORD_TYPE_ZH: Record<string, string> = {
  lead: '线索',
  account: '客户',
  contact: '联系人',
  opportunity: '商机',
  quote: '报价单',
  order: '订单',
  contract: '合同',
  activity: '活动',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [recordType, setRecordType] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [skip, setSkip] = useState(0);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const { data: facets } = useQuery<{ recordTypes: string[]; actions: string[] }>({
    queryKey: ['audit-facets'],
    queryFn: () => adminApi.auditLogFacets(),
    staleTime: 60_000,
  });

  const { data, isLoading, isFetching, refetch } = useQuery<AuditResponse>({
    queryKey: ['audit-log', recordType, action, search, skip],
    queryFn: () => adminApi.auditLog({
      recordType: recordType || undefined,
      action: action || undefined,
      search: search || undefined,
      skip,
      take: PAGE_SIZE,
    }),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  function toggleRow(id: string) {
    const next = new Set(openRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenRows(next);
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setSkip(0);
  }

  function resetFilters() {
    setRecordType('');
    setAction('');
    setSearch('');
    setSearchInput('');
    setSkip(0);
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <History size={20} />
            </div>
            操作审计日志
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            完整记录系统内所有数据变更（创建 / 更新 / 删除 / 转化 / 审批），用于合规与回溯
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

      {/* Filters */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">对象类型</label>
            <Select value={recordType} onValueChange={(v) => { setRecordType(v === '__all' ? '' : v); setSkip(0); }}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部</SelectItem>
                {(facets?.recordTypes ?? []).map((t) => (
                  <SelectItem key={t} value={t}>{RECORD_TYPE_ZH[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">操作类型</label>
            <Select value={action} onValueChange={(v) => { setAction(v === '__all' ? '' : v); setSkip(0); }}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部</SelectItem>
                {(facets?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_ZH[a] ?? a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={applySearch} className="space-y-1.5 md:col-span-2 flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">搜索 ID / 类型</label>
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="输入对象 ID 或类型片段"
                className="h-10 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-10 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-1.5">
              <Search size={14} /> 搜索
            </Button>
            {(recordType || action || search) && (
              <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" onClick={resetFilters}>
                重置
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <Filter size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">没有匹配的审计记录</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const isOpen = openRows.has(row.id);
                const actor = row.actorId ? data?.actorMap[row.actorId] : null;
                const changeKeys = Object.keys(row.changes ?? {});
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => toggleRow(row.id)}
                      className="w-full px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors text-left"
                    >
                      <div className="mt-0.5 shrink-0">
                        {isOpen
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <ActionPill action={row.action} />
                          <span className="text-sm font-black text-ink">
                            {RECORD_TYPE_ZH[row.recordType] ?? row.recordType}
                          </span>
                          <span className="text-xs font-mono text-slate-400 truncate">{row.recordId}</span>
                          {changeKeys.length > 0 && row.action === 'update' && (
                            <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-violet-50 text-violet-600 inline-flex items-center">
                              {changeKeys.length} 个字段变化
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400">
                          {actor ? (
                            <span className="flex items-center gap-1">
                              <UserIcon size={10} /> {actor.displayName}
                            </span>
                          ) : (
                            <span>系统</span>
                          )}
                          <span>{fmtDate(row.createdAt, 'YYYY-MM-DD HH:mm:ss')}</span>
                          {row.ip && <span className="font-mono">{row.ip}</span>}
                        </div>
                      </div>
                    </button>

                    {isOpen && changeKeys.length > 0 && (
                      <div className="bg-slate-50/40 px-6 pb-4 pt-1">
                        <div className="ml-7 rounded-xl bg-white border border-slate-100 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                              <tr>
                                <th className="px-4 py-2 text-left w-1/4">字段</th>
                                <th className="px-4 py-2 text-left w-3/8">原值</th>
                                <th className="px-4 py-2 text-left w-3/8">新值</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {changeKeys.map((k) => {
                                const c = row.changes[k];
                                return (
                                  <tr key={k}>
                                    <td className="px-4 py-2 font-mono font-bold text-slate-700">{k}</td>
                                    <td className="px-4 py-2 text-red-600 line-through font-mono text-[11px] truncate max-w-xs">{fmtJsonish(c.from)}</td>
                                    <td className="px-4 py-2 text-emerald-600 font-mono text-[11px] truncate max-w-xs">{fmtJsonish(c.to)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
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
    </div>
  );
}

function ActionPill({ action }: { action: string }) {
  const cfg =
    action === 'create' ? { bg: 'bg-emerald-50', text: 'text-emerald-700' }
    : action === 'update' ? { bg: 'bg-blue-50', text: 'text-blue-700' }
    : action === 'delete' ? { bg: 'bg-red-50', text: 'text-red-700' }
    : action === 'convert' ? { bg: 'bg-violet-50', text: 'text-violet-700' }
    : action.startsWith('approve') ? { bg: 'bg-emerald-50', text: 'text-emerald-700' }
    : action.startsWith('reject') ? { bg: 'bg-amber-50', text: 'text-amber-700' }
    : { bg: 'bg-slate-100', text: 'text-slate-600' };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-black px-2 h-5 rounded-full uppercase tracking-wider', cfg.bg, cfg.text)}>
      {ACTION_ZH[action] ?? action}
    </span>
  );
}

function fmtJsonish(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
