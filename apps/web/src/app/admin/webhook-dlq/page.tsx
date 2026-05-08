'use client';
// ─── /admin/webhook-dlq ──────────────────────────────────────────────────
// Inspect / replay / resolve outbound webhook deliveries that the runtime
// parked into the dead-letter queue.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhookDlqApi } from '@/lib/api';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Webhook, Loader2, RefreshCw, RotateCw, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, XCircle,
} from 'lucide-react';

interface DlqEntry {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  idempotencyKey: string;
  workflowId: string | null;
  recordType: string | null;
  recordId: string | null;
  resolvedAt: string | null;
  resolvedNote: string | null;
  createdAt: string;
}

export default function WebhookDlqPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<DlqEntry | null>(null);
  const [resolveNote, setResolveNote] = useState('');

  const { data, isLoading, isFetching, refetch, error } = useQuery<DlqEntry[]>({
    queryKey: ['webhook-dlq', tab],
    queryFn: () => webhookDlqApi.list(tab === 'resolved', 200),
    staleTime: 15_000,
  });

  const replayMut = useMutation({
    mutationFn: (id: string) => webhookDlqApi.replay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-dlq'] }),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => webhookDlqApi.resolve(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhook-dlq'] });
      setResolveTarget(null);
      setResolveNote('');
    },
  });

  const rows = data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Webhook size={20} />
            </div>
            Webhook 死信队列
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            外发 webhook 多次失败后会进入此队列。可以重放（最长 10s 超时）或人工标记已解决
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'resolved')}>
        <TabsList className="bg-white shadow-md rounded-xl h-10 p-1">
          <TabsTrigger
            value="pending"
            className="rounded-lg font-bold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            待处理
          </TabsTrigger>
          <TabsTrigger
            value="resolved"
            className="rounded-lg font-bold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            已解决
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <XCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <CheckCircle2 size={28} className="mx-auto text-emerald-300 mb-3" />
              <p className="text-base font-black text-slate-400">
                {tab === 'pending' ? '没有待处理的死信，干干净净' : '没有已解决的记录'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const isOpen = openId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : r.id)}
                      className="w-full px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors text-left"
                    >
                      <div className="mt-0.5 shrink-0">
                        {isOpen
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-slate-100 text-slate-700 uppercase inline-flex items-center font-mono">
                            {r.method}
                          </span>
                          <span className="text-sm font-bold text-ink truncate max-w-[600px]" title={r.url}>{r.url}</span>
                          {r.lastStatus !== null && (
                            <span className={cn(
                              'text-[10px] font-black px-1.5 h-4 rounded-full inline-flex items-center font-mono',
                              r.lastStatus >= 200 && r.lastStatus < 300
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.lastStatus >= 400 && r.lastStatus < 500
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700',
                            )}>
                              HTTP {r.lastStatus}
                            </span>
                          )}
                          <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-violet-50 text-violet-700 inline-flex items-center">
                            重试 {r.attempts}
                          </span>
                          {r.resolvedAt && (
                            <span className="text-[10px] font-black px-1.5 h-4 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center">
                              已解决
                            </span>
                          )}
                        </div>
                        {r.lastError && (
                          <div className="text-xs font-mono text-red-500 truncate max-w-[800px]">{r.lastError}</div>
                        )}
                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 mt-1">
                          <span>收到于 {fmtDate(r.createdAt, 'YYYY-MM-DD HH:mm:ss')}</span>
                          <span>·</span>
                          <span>{fmtRelative(r.createdAt)}</span>
                          {r.recordType && r.recordId && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{r.recordType}/{r.recordId}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {!r.resolvedAt && (
                        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl gap-1 font-bold"
                            onClick={() => replayMut.mutate(r.id)}
                            disabled={replayMut.isPending && replayMut.variables === r.id}
                          >
                            {replayMut.isPending && replayMut.variables === r.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <RotateCw size={12} />}
                            重放
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl gap-1 font-bold"
                            onClick={() => setResolveTarget(r)}
                          >
                            <CheckCircle2 size={12} /> 标记已解决
                          </Button>
                        </div>
                      )}
                    </button>

                    {isOpen && (
                      <div className="bg-slate-50/40 px-6 pb-5 pt-1">
                        <div className="ml-7 space-y-3">
                          <DetailRow label="Idempotency Key" value={<code className="font-mono text-[11px]">{r.idempotencyKey}</code>} />
                          {r.workflowId && (
                            <DetailRow label="Workflow ID" value={<code className="font-mono text-[11px]">{r.workflowId}</code>} />
                          )}
                          {r.resolvedNote && (
                            <DetailRow label="解决备注" value={<span className="text-sm">{r.resolvedNote}</span>} />
                          )}
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Headers</div>
                            <pre className="rounded-xl bg-white border border-slate-100 p-3 text-[11px] font-mono text-slate-700 overflow-x-auto">
{JSON.stringify(r.headers ?? {}, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Body</div>
                            <pre className="rounded-xl bg-white border border-slate-100 p-3 text-[11px] font-mono text-slate-700 overflow-x-auto max-h-72">
{prettyJson(r.body)}
                            </pre>
                          </div>
                          {replayMut.isError && replayMut.variables === r.id && (
                            <div className="text-xs font-bold text-red-600">
                              重放失败：{(replayMut.error as Error)?.message}
                            </div>
                          )}
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

      {/* Resolve dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={(b) => { if (!b) { setResolveTarget(null); setResolveNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-500" />
              标记为已解决
            </DialogTitle>
            <DialogDescription>
              这条死信将不会再被重放。可以选填一条说明（例如「下游已手动补发」）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="备注（可选）"
              className="h-10 rounded-xl"
            />
            {resolveMut.isError && (
              <div className="text-xs font-bold text-red-600">
                失败：{(resolveMut.error as Error)?.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setResolveTarget(null)}>
              取消
            </Button>
            <Button
              className="rounded-xl bg-ink hover:bg-slate-800 text-white gap-2 font-bold"
              disabled={resolveMut.isPending}
              onClick={() => resolveTarget && resolveMut.mutate({ id: resolveTarget.id, note: resolveNote.trim() || undefined })}
            >
              {resolveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider w-32 pt-0.5 shrink-0">{label}</div>
      <div className="flex-1 min-w-0 break-all">{value}</div>
    </div>
  );
}

function prettyJson(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// suppress unused warning for AlertTriangle (reserved for future error states)
void AlertTriangle;
