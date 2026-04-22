'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { contractsApi } from '@/lib/api';
import { fmtDate, fmtMoney, statusColor, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, FileSignature, Zap, XCircle,
  CheckCircle2, Circle, MinusCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contract {
  id: string;
  contractNumber: string;
  accountId?: string;
  account?: { name: string };
  orderId?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  totalValue?: number;
  description?: string;
  createdAt: string;
}

const STATUS_ZH: Record<string, string> = {
  draft: '草稿', activated: '已激活', terminated: '已终止',
};

// ─── Status Timeline ──────────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: string }) {
  const steps = [
    { key: 'draft', label: '草稿', icon: Circle },
    { key: 'activated', label: '已激活', icon: CheckCircle2 },
    { key: 'terminated', label: '已终止', icon: MinusCircle },
  ];

  const orderMap: Record<string, number> = { draft: 0, activated: 1, terminated: 2 };
  const currentIdx = orderMap[status] ?? 0;

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isTerminated = step.key === 'terminated';
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  isCurrent && isTerminated
                    ? 'bg-red-100 text-red-500 ring-2 ring-red-200'
                    : isCurrent
                    ? 'bg-brand/10 text-brand ring-2 ring-brand/20'
                    : isPast
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-300',
                )}
              >
                <Icon size={18} />
              </div>
              <span
                className={cn(
                  'text-xs font-bold whitespace-nowrap',
                  isCurrent && isTerminated
                    ? 'text-red-500'
                    : isCurrent
                    ? 'text-brand'
                    : isPast
                    ? 'text-emerald-600'
                    : 'text-slate-300',
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-20 mx-2 mb-5 rounded-full transition-all',
                  idx < currentIdx ? 'bg-emerald-300' : 'bg-slate-100',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Terminate Confirm Dialog ─────────────────────────────────────────────────
function TerminateDialog({
  contractNumber,
  open,
  onConfirm,
  onClose,
  isPending,
}: {
  contractNumber: string;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-lg font-bold text-ink flex items-center gap-2">
            <XCircle size={18} className="text-red-500" />
            确认终止合同
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-4 space-y-3">
          <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
            <p className="text-sm text-red-700 font-medium leading-relaxed">
              您即将终止合同{' '}
              <span className="font-black">{contractNumber}</span>。
              终止后合同将无法恢复，请谨慎操作。
            </p>
          </div>
        </div>
        <DialogFooter className="px-6 pb-6 pt-2 flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1 rounded-xl h-10 font-bold">
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold h-10"
          >
            {isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <XCircle size={14} className="mr-2" />}
            确认终止
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [terminateOpen, setTerminateOpen] = useState(false);

  const { data: contract, isLoading, isError } = useQuery<Contract>({
    queryKey: ['contract', id],
    queryFn: () => contractsApi.get(id),
    enabled: !!id,
  });

  const activateMutation = useMutation({
    mutationFn: () => contractsApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract', id] }),
  });

  const terminateMutation = useMutation({
    mutationFn: () => contractsApi.terminate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      setTerminateOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span className="font-medium">加载中…</span>
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 gap-2">
        <AlertCircle size={18} />
        <span className="font-medium">加载失败，请返回重试</span>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/contracts">
            <Button variant="ghost" className="rounded-xl h-10 w-10 p-0 hover:bg-slate-100">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-ink tracking-tight font-mono">
                {contract.contractNumber}
              </h1>
              <Badge
                variant="outline"
                className={cn('border-none font-bold', statusColor(contract.status))}
              >
                {STATUS_ZH[contract.status] ?? contract.status}
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {contract.account?.name ?? '—'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {contract.status === 'draft' && (
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold h-10 px-5 shadow-lg shadow-emerald-200"
            >
              {activateMutation.isPending
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <Zap size={14} className="mr-2" />}
              激活合同
            </Button>
          )}
          {contract.status === 'activated' && (
            <Button
              onClick={() => setTerminateOpen(true)}
              className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold h-10 px-5"
            >
              <XCircle size={14} className="mr-2" />
              终止合同
            </Button>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="px-8 py-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5">合同状态流转</p>
          <StatusTimeline status={contract.status} />
        </CardContent>
      </Card>

      {/* Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            label: '客户',
            value: contract.account?.name ?? '—',
            highlight: false,
          },
          {
            label: '关联订单',
            value: contract.orderId ? (
              <Link
                href={`/orders/${contract.orderId}`}
                className="font-bold text-brand hover:underline font-mono text-sm"
              >
                {contract.orderId}
              </Link>
            ) : <span className="text-slate-400 text-sm">—</span>,
            highlight: false,
          },
          {
            label: '合同金额',
            value: fmtMoney(contract.totalValue),
            highlight: true,
          },
          {
            label: '开始日期',
            value: fmtDate(contract.startDate),
            highlight: false,
          },
          {
            label: '结束日期',
            value: fmtDate(contract.endDate),
            highlight: false,
          },
          {
            label: '创建时间',
            value: fmtDate(contract.createdAt),
            highlight: false,
          },
        ].map((item) => (
          <Card key={item.label} className="border-none shadow-xl shadow-slate-200/40 rounded-2xl bg-white">
            <CardContent className="p-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {item.label}
              </p>
              {typeof item.value === 'string' ? (
                <p className={cn('text-sm', item.highlight ? 'text-2xl font-black text-ink' : 'font-medium text-ink')}>
                  {item.value}
                </p>
              ) : (
                item.value
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Description */}
      {contract.description && (
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardHeader className="border-b border-slate-100 px-6 py-4">
            <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
              <FileSignature size={16} className="text-brand" />
              合同描述
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {contract.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Terminate Confirm Dialog */}
      <TerminateDialog
        contractNumber={contract.contractNumber}
        open={terminateOpen}
        onConfirm={() => terminateMutation.mutate()}
        onClose={() => setTerminateOpen(false)}
        isPending={terminateMutation.isPending}
      />
    </div>
  );
}
