'use client';
// /cases/[id] — Case detail with article-deflection panel + SLA milestones panel.
// Wave 20h: ships the side rails for KB suggestions and SLA tracking.

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { casesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { fmtDate, fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, LifeBuoy, Loader2, Sparkles, Clock,
  CheckCircle2, AlertTriangle, ExternalLink, Zap,
} from 'lucide-react';

interface CaseDetail {
  id: string;
  caseNumber: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  source: string | null;
  account?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string | null; lastName: string | null } | null;
  owner?: { id: string; displayName: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface SuggestedArticle {
  id: string;
  articleNumber: string;
  title: string;
  summary: string | null;
  score: number;
}

interface Milestone {
  id: string;
  type: string;
  targetAt: string;
  completedAt: string | null;
  status: 'pending' | 'completed' | 'breached' | string;
}

const STATUS_BADGE: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  WORKING: 'bg-amber-50 text-amber-700',
  ESCALATED: 'bg-rose-50 text-rose-700',
  WAITING_ON_CUSTOMER: 'bg-violet-50 text-violet-700',
  CLOSED_RESOLVED: 'bg-emerald-50 text-emerald-700',
  CLOSED_NOT_RESOLVED: 'bg-slate-100 text-slate-500',
};

const MILESTONE_LABEL: Record<string, string> = {
  first_response: '首次响应',
  resolution: '解决',
  FIRST_RESPONSE: '首次响应',
  RESOLUTION: '解决',
};

const MILESTONE_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'bg-blue-50 text-blue-700 border-blue-100', label: '待处理' },
  completed: { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: '已完成' },
  breached: { color: 'bg-rose-50 text-rose-700 border-rose-100', label: '已逾期' },
};

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin') ?? false;

  const caseQ = useQuery<CaseDetail>({
    queryKey: ['case', id],
    queryFn: () => casesApi.get(id),
    enabled: !!id,
  });

  const milestonesQ = useQuery<Milestone[]>({
    queryKey: ['case-milestones', id],
    queryFn: () => casesApi.milestones(id),
    enabled: !!id,
  });

  const suggestQ = useQuery<SuggestedArticle[] | { data: SuggestedArticle[] }>({
    queryKey: ['case-suggest-articles', id],
    queryFn: () => casesApi.suggestArticles(id, 5),
    enabled: !!id,
    staleTime: 60_000,
  });

  const firstResponseMut = useMutation({
    mutationFn: () => casesApi.markFirstResponse(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-milestones', id] }),
  });

  if (caseQ.isLoading || !caseQ.data) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }

  const c = caseQ.data;
  const milestones = milestonesQ.data ?? [];
  const suggestRaw = suggestQ.data;
  const suggestions: SuggestedArticle[] = Array.isArray(suggestRaw)
    ? suggestRaw
    : Array.isArray((suggestRaw as { data?: SuggestedArticle[] })?.data)
    ? (suggestRaw as { data: SuggestedArticle[] }).data
    : [];

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <button
        onClick={() => router.push('/cases')}
        className="text-sm font-bold text-slate-500 hover:text-ink inline-flex items-center gap-1.5"
      >
        <ArrowLeft size={14} /> 返回工单列表
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Main */}
        <div className="space-y-5 min-w-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs font-mono font-black text-slate-400 px-2 py-0.5 rounded bg-slate-50">
                {c.caseNumber}
              </span>
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                STATUS_BADGE[c.status] ?? 'bg-slate-100 text-slate-500',
              )}>
                {c.status}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                优先级 {c.priority}
              </span>
            </div>
            <h1 className="text-2xl font-black text-ink tracking-tight">
              {c.subject}
            </h1>
            {c.description && (
              <p className="text-sm text-slate-600 leading-relaxed mt-3 whitespace-pre-line">
                {c.description}
              </p>
            )}
          </div>

          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 grid grid-cols-2 gap-4 text-sm">
              <Field label="客户" value={c.account?.name} />
              <Field
                label="联系人"
                value={
                  c.contact
                    ? [c.contact.firstName, c.contact.lastName].filter(Boolean).join(' ')
                    : null
                }
              />
              <Field label="负责人" value={c.owner?.displayName} />
              <Field label="来源" value={c.source} />
              <Field label="创建于" value={fmtDate(c.createdAt, 'YYYY-MM-DD HH:mm')} />
              <Field label="更新于" value={fmtRelative(c.updatedAt)} />
            </CardContent>
          </Card>
        </div>

        {/* Side rails */}
        <div className="space-y-4">
          {/* SLA milestones */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ink flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  SLA 里程碑
                </h3>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-lg text-[11px] font-bold gap-1"
                    onClick={() => firstResponseMut.mutate()}
                    disabled={firstResponseMut.isPending}
                  >
                    <Zap size={10} /> 标记首响应
                  </Button>
                )}
              </div>
              {milestonesQ.isLoading ? (
                <Loader2 size={14} className="animate-spin text-slate-300" />
              ) : milestones.length === 0 ? (
                <p className="text-xs font-bold text-slate-400">暂无适用的 SLA 策略</p>
              ) : (
                <ul className="space-y-2">
                  {milestones.map((m) => {
                    const cfg = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <li key={m.id} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50/50">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-black text-ink">
                            {MILESTONE_LABEL[m.type] ?? m.type}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                            目标 {fmtDate(m.targetAt, 'MM-DD HH:mm')}
                            {m.completedAt && (
                              <> · 完成 {fmtDate(m.completedAt, 'MM-DD HH:mm')}</>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          'text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap inline-flex items-center gap-1',
                          cfg.color,
                        )}>
                          {m.status === 'completed' && <CheckCircle2 size={10} />}
                          {m.status === 'breached' && <AlertTriangle size={10} />}
                          {cfg.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Article deflection */}
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-black text-ink flex items-center gap-2">
                <Sparkles size={14} className="text-violet-500" />
                建议文章
              </h3>
              {suggestQ.isLoading ? (
                <Loader2 size={14} className="animate-spin text-slate-300" />
              ) : suggestions.length === 0 ? (
                <p className="text-xs font-bold text-slate-400">没有匹配的知识库文章</p>
              ) : (
                <ul className="space-y-2">
                  {suggestions.map((a) => (
                    <li key={a.id} className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/knowledge/${a.id}`}
                            className="text-[13px] font-black text-ink hover:text-brand line-clamp-2 inline-flex items-start gap-1"
                          >
                            {a.title}
                            <ExternalLink size={10} className="mt-1 shrink-0 text-slate-300" />
                          </Link>
                          {a.summary && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                              {a.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-mono font-black text-slate-400">
                              {a.articleNumber}
                            </span>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
                              相关度 {Math.round((a.score ?? 0) * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <Link
                          href={`/knowledge/${a.id}`}
                          className="text-[11px] font-bold text-brand hover:underline"
                        >
                          已采用此文章 →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-ink mt-0.5">{value ?? '—'}</p>
    </div>
  );
}

void LifeBuoy;
