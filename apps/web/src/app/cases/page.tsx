'use client';
// /cases — minimal list view for navigating to case detail (Wave 20h)
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { casesApi } from '@/lib/api';
import { fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { LifeBuoy, Loader2 } from 'lucide-react';

interface CaseRow {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  account?: { name: string } | null;
  contact?: { firstName: string | null; lastName: string | null } | null;
  owner?: { displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  WORKING: 'bg-amber-50 text-amber-700',
  ESCALATED: 'bg-rose-50 text-rose-700',
  WAITING_ON_CUSTOMER: 'bg-violet-50 text-violet-700',
  CLOSED_RESOLVED: 'bg-emerald-50 text-emerald-700',
  CLOSED_NOT_RESOLVED: 'bg-slate-100 text-slate-500',
};

const PRIORITY_BADGE: Record<string, string> = {
  URGENT: 'bg-rose-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  NORMAL: 'bg-slate-200 text-slate-700',
  LOW: 'bg-slate-100 text-slate-500',
};

export default function CaseListPage() {
  const { data, isLoading } = useQuery<{ data: CaseRow[]; total: number }>({
    queryKey: ['cases-list'],
    queryFn: () => casesApi.list({ take: 100 }),
    staleTime: 15_000,
  });
  const rows = data?.data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
            <LifeBuoy size={20} />
          </div>
          服务工单
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-2">
          所有进行中和已关闭的服务工单
        </p>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <LifeBuoy size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">暂无工单</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">编号</th>
                  <th className="px-6 py-3 text-left">主题</th>
                  <th className="px-6 py-3 text-left">客户</th>
                  <th className="px-6 py-3 text-left">优先级</th>
                  <th className="px-6 py-3 text-left">状态</th>
                  <th className="px-6 py-3 text-right">更新</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono font-black text-slate-500">
                      <Link href={`/cases/${c.id}`} className="hover:text-brand">
                        {c.caseNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-ink">
                      <Link href={`/cases/${c.id}`} className="hover:text-brand">
                        {c.subject}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {c.account?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'text-[10px] font-black px-2 py-0.5 rounded-full',
                        PRIORITY_BADGE[c.priority] ?? PRIORITY_BADGE.NORMAL,
                      )}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full',
                        STATUS_BADGE[c.status] ?? 'bg-slate-100 text-slate-500',
                      )}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(c.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
