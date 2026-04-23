'use client';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { fmtMoney, cn } from '@/lib/utils';

interface Opp { id: string; name: string; stage: string; amount: any; closeDate?: string; owner?: { displayName?: string }; account?: { name?: string } }

const STAGE_LABEL: Record<string, string> = {
  prospecting: '勘探', qualification: '资质评估', needs_analysis: '需求分析',
  value_proposition: '价值主张', proposal: '提案', negotiation: '谈判',
  closed_won: '赢单', closed_lost: '丢单',
};

interface Props { title: string; opps: Opp[]; onClose: () => void }

export function OppDrawer({ title, opps, onClose }: Props) {
  const total = opps.reduce((s, o) => s + Number(o.amount ?? 0), 0);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[480px] max-h-[60vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-border animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div>
          <p className="font-bold text-ink text-sm">{title}</p>
          <p className="text-xs text-ink-muted mt-0.5">{opps.length} 条商机 · 合计 {fmtMoney(total)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all">
          <X size={15} />
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 divide-y divide-border/50">
        {opps.length === 0 ? (
          <p className="text-center text-ink-muted text-sm py-8">无商机数据</p>
        ) : opps.map((o) => (
          <div key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary/50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Link href={`/opportunities/${o.id}`} className="font-semibold text-sm text-ink hover:text-brand transition-colors truncate">
                  {o.name}
                </Link>
                <Link href={`/opportunities/${o.id}`} target="_blank">
                  <ExternalLink size={11} className="text-slate-300 hover:text-brand shrink-0" />
                </Link>
              </div>
              <p className="text-xs text-ink-muted truncate">
                {o.account?.name} · {o.owner?.displayName} · {STAGE_LABEL[o.stage] ?? o.stage}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-ink">{fmtMoney(Number(o.amount ?? 0))}</p>
              {o.closeDate && (
                <p className="text-xs text-ink-muted">
                  {new Date(o.closeDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
