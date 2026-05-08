'use client';
// ─── /admin/persons/[id] ─────────────────────────────────────────────────
// Customer 360 detail — header pills + related leads/contacts +
// chronological unified timeline. Top-right "合并到..." for admin merges.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personApi } from '@/lib/api';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, Mail, Phone, GitMerge, XCircle, CheckCircle2,
  Search, User as UserIcon, Briefcase, AlertCircle, ExternalLink,
} from 'lucide-react';

interface PersonDetail {
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
  leads: Array<{ id: string; firstName: string | null; lastName: string | null; company: string | null; status: string | null; createdAt: string }>;
  contacts: Array<{ id: string; firstName: string | null; lastName: string | null; accountId: string | null; createdAt: string }>;
}

interface TimelineEntry {
  type: string;
  at: string;
  recordId: string;
  recordType: string;
  title: string;
  detail?: string;
  ownerId?: string | null;
}

const TYPE_ZH: Record<string, string> = {
  'lead.created': '线索创建',
  'contact.created': '联系人创建',
  'activity': '活动',
  'case.created': '工单创建',
  'quote.created': '报价单',
  'order.created': '订单',
  'campaign.member': '营销活动加入',
  'ai.insight': 'AI 洞察',
};

const TYPE_COLOR: Record<string, string> = {
  'lead.created':      'bg-blue-50 text-blue-700 ring-blue-200',
  'contact.created':   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'activity':          'bg-violet-50 text-violet-700 ring-violet-200',
  'case.created':      'bg-amber-50 text-amber-700 ring-amber-200',
  'quote.created':     'bg-cyan-50 text-cyan-700 ring-cyan-200',
  'order.created':     'bg-pink-50 text-pink-700 ring-pink-200',
  'campaign.member':   'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  'ai.insight':        'bg-orange-50 text-orange-700 ring-orange-200',
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [mergeOpen, setMergeOpen] = useState(false);

  const { data: person, isLoading, error } = useQuery<PersonDetail>({
    queryKey: ['person', id],
    queryFn: () => personApi.get(id),
    enabled: !!id,
  });

  const { data: timeline, isLoading: tlLoading } = useQuery<TimelineEntry[]>({
    queryKey: ['person', id, 'timeline'],
    queryFn: () => personApi.timeline(id, 200),
    enabled: !!id,
  });

  const grouped = useMemo(() => groupByDate(timeline ?? []), [timeline]);

  function fullName() {
    if (!person) return '';
    return [person.firstName, person.lastName].filter(Boolean).join(' ') || '(无姓名)';
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (error || !person) {
    return (
      <div className="p-16 text-center">
        <XCircle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">
          {error ? `加载失败：${(error as Error).message}` : 'Person 不存在'}
        </p>
        <Button
          variant="outline"
          className="mt-4 rounded-xl"
          onClick={() => router.push('/admin/persons')}
        >
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        className="h-8 -ml-2 rounded-xl gap-1.5 font-bold text-slate-500"
        onClick={() => router.push('/admin/persons')}
      >
        <ArrowLeft size={14} /> 返回列表
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <UserIcon size={20} />
            </div>
            {fullName()}
          </h1>
          <div className="flex items-center gap-3 mt-3 flex-wrap text-sm font-medium text-slate-500">
            {person.primaryEmail && (
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} /> {person.primaryEmail}
              </span>
            )}
            {person.primaryPhone && (
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Phone size={13} /> {person.primaryPhone}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <CountPill label="线索" value={person.leadCount} color="bg-blue-50 text-blue-700" />
            <CountPill label="联系人" value={person.contactCount} color="bg-emerald-50 text-emerald-700" />
            <CountPill label="商机" value={person.opportunityCount} color="bg-violet-50 text-violet-700" />
            <CountPill label="工单" value={person.caseCount} color="bg-amber-50 text-amber-700" />
            <CountPill label="营销" value={person.campaignCount} color="bg-fuchsia-50 text-fuchsia-700" />
          </div>
        </div>
        <Button
          className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
          onClick={() => setMergeOpen(true)}
        >
          <GitMerge size={14} /> 合并到...
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: related */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Briefcase size={14} /> 关联线索（{person.leads.length}）
              </h2>
              {person.leads.length === 0 ? (
                <div className="text-xs font-bold text-slate-300 py-3 text-center">无关联线索</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {person.leads.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/leads/${l.id}`}
                        className="flex items-center justify-between py-2.5 hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-ink truncate">
                            {[l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 truncate">
                            {l.company ?? '—'} · {l.status ?? '—'}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-slate-300 group-hover:text-slate-500 shrink-0 ml-2" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <UserIcon size={14} /> 关联联系人（{person.contacts.length}）
              </h2>
              {person.contacts.length === 0 ? (
                <div className="text-xs font-bold text-slate-300 py-3 text-center">无关联联系人</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {person.contacts.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/contacts/${c.id}`}
                        className="flex items-center justify-between py-2.5 hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-ink truncate">
                            {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 truncate">
                            创建于 {fmtDate(c.createdAt, 'YYYY-MM-DD')}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-slate-300 group-hover:text-slate-500 shrink-0 ml-2" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-3">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4">
                统一时间线
              </h2>
              {tlLoading ? (
                <div className="p-8 text-center">
                  <Loader2 size={18} className="animate-spin mx-auto text-slate-300" />
                </div>
              ) : (timeline ?? []).length === 0 ? (
                <div className="p-8 text-center">
                  <AlertCircle size={24} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-bold text-slate-400">暂无时间线事件</p>
                </div>
              ) : (
                <ol className="relative">
                  {/* vertical line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
                  {grouped.map(({ date, entries }) => (
                    <li key={date} className="mb-5">
                      <div className="ml-8 mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {date}
                      </div>
                      <ul className="space-y-3">
                        {entries.map((e, i) => {
                          const colorCls = TYPE_COLOR[e.type] ?? 'bg-slate-50 text-slate-600 ring-slate-200';
                          return (
                            <li key={`${e.recordType}-${e.recordId}-${i}`} className="relative pl-8">
                              <div
                                className={cn(
                                  'absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full ring-2 ring-white',
                                  colorCls.split(' ')[0],
                                )}
                                aria-hidden
                              />
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className={cn(
                                      'text-[10px] font-black px-1.5 h-4 rounded-full inline-flex items-center uppercase',
                                      colorCls,
                                    )}>
                                      {TYPE_ZH[e.type] ?? e.type}
                                    </span>
                                    <span className="text-sm font-black text-ink truncate">{e.title}</span>
                                  </div>
                                  {e.detail && (
                                    <div className="text-xs font-medium text-slate-500 line-clamp-2">{e.detail}</div>
                                  )}
                                </div>
                                <span className="text-[11px] font-bold text-slate-400 shrink-0">
                                  {fmtDate(e.at, 'HH:mm')}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        winnerId={person.id}
        winnerName={fullName()}
      />
    </div>
  );
}

function CountPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-xs font-bold', color)}>
      <span className="opacity-70">{label}</span>
      <span className="font-black tabular-nums">{value}</span>
    </span>
  );
}

function groupByDate(entries: TimelineEntry[]): Array<{ date: string; entries: TimelineEntry[] }> {
  const map = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const d = fmtDate(e.at, 'YYYY-MM-DD');
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  return Array.from(map.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ─── Merge dialog ──────────────────────────────────────────────────────────

function MergeDialog({
  open, onOpenChange, winnerId, winnerName,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  winnerId: string;
  winnerName: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery<{ data: Array<{ id: string; firstName: string | null; lastName: string | null; primaryEmail: string | null }>; total: number }>({
    queryKey: ['person-merge-search', search],
    queryFn: () => personApi.list({ search, take: 20 }),
    enabled: open && search.length > 0,
  });

  const mergeMut = useMutation({
    mutationFn: () => personApi.merge(winnerId, selected!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['person', winnerId] });
      qc.invalidateQueries({ queryKey: ['persons'] });
      onOpenChange(false);
      setSelected(null);
      setSearch('');
      router.refresh();
    },
  });

  const matches = (data?.data ?? []).filter((p) => p.id !== winnerId);

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) { setSelected(null); setSearch(''); } onOpenChange(b); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <GitMerge size={20} /> 合并 Person
          </DialogTitle>
          <DialogDescription>
            将另一个 Person <span className="font-bold">合并到 {winnerName}</span>。
            被合并方的所有 Lead / Contact / 时间线会重新挂到这个 Person 下。该操作不可撤销。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按邮箱 / 电话 / 姓名搜索另一个 Person"
              className="h-10 rounded-xl pl-9"
              autoFocus
            />
          </div>

          {selected ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-emerald-800 uppercase tracking-wider">已选</div>
                <div className="text-sm font-bold text-emerald-900">{selected.name}</div>
                <div className="text-[11px] font-mono text-emerald-700">{selected.id}</div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl h-8" onClick={() => setSelected(null)}>
                更换
              </Button>
            </div>
          ) : isLoading ? (
            <div className="p-4 text-center text-xs font-bold text-slate-400">
              <Loader2 size={14} className="animate-spin mx-auto" />
            </div>
          ) : matches.length === 0 && search ? (
            <div className="p-4 text-center text-xs font-bold text-slate-400">未找到匹配 Person</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
              {matches.map((p) => {
                const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(无姓名)';
                return (
                  <li
                    key={p.id}
                    className="px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected({ id: p.id, name })}
                  >
                    <div className="text-sm font-bold text-ink">{name}</div>
                    <div className="text-[11px] font-medium text-slate-500 truncate">
                      {p.primaryEmail ?? '—'} · <span className="font-mono">{p.id}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {mergeMut.isError && (
            <div className="text-xs font-bold text-red-600">
              合并失败：{(mergeMut.error as Error)?.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white gap-2 font-bold"
            disabled={!selected || mergeMut.isPending}
            onClick={() => mergeMut.mutate()}
          >
            {mergeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            确认合并
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// suppress unused
void fmtRelative;
