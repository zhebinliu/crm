'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, RotateCcw, Clock, ShieldCheck, User, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';

interface ApprovalRequest {
  id: string;
  objectApiName: string;
  recordId: string;
  status: string;
  createdAt: string;
  submittedAt?: string;
  resolvedAt?: string;
  process?: { name: string };
  submitter?: { displayName: string; email: string };
  currentStep?: { name: string };
}

const STATUS_OPTS = [
  { value: 'ALL', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'recalled', label: '已撤回' },
];

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-100',
  approved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected: 'bg-red-50 text-red-600 border-red-100',
  recalled: 'bg-slate-50 text-slate-500 border-slate-100',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理', approved: '已批准', rejected: '已驳回', recalled: '已撤回',
};

export default function AdminApprovalsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [comment, setComment] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['approval-requests', status],
    queryFn: () => approvalApi.listRequests({ status: status === 'ALL' ? undefined : status }),
  });

  const requests: ApprovalRequest[] = data?.data ?? data ?? [];

  const approveMutation = useMutation({
    mutationFn: ({ id, c }: { id: string; c?: string }) => approvalApi.approve(id, { comment: c }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-requests'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, c }: { id: string; c?: string }) => approvalApi.reject(id, { comment: c }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-requests'] }),
  });
  const recallMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => approvalApi.recall(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-requests'] }),
  });

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">审批中心</h1>
            <p className="text-sm text-ink-secondary mt-1">管理并执行业务流程中的各类审批请求。</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <Select value={status} onValueChange={setStatus}>
             <SelectTrigger className="w-[140px] h-10 border-slate-200">
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               {STATUS_OPTS.map((o) => (
                 <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
               ))}
             </SelectContent>
           </Select>
           <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['approval-requests'] })} className="gap-2 border-slate-200">
             <RefreshCw className={isLoading ? 'animate-spin' : ''} size={14} /> 刷新
           </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: '待处理请求', value: requests.filter(r => r.status === 'pending').length, icon: <Clock size={20} />, color: 'bg-amber-50 text-amber-600 border-amber-100' },
          { label: '本月已批准', value: requests.filter(r => r.status === 'approved').length, icon: <CheckCircle size={20} />, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
          { label: '本月已驳回', value: requests.filter(r => r.status === 'rejected').length, icon: <XCircle size={20} />, color: 'bg-red-50 text-red-600 border-red-100' },
        ].map((stat) => (
          <Card key={stat.label} className="border-none shadow-lg shadow-slate-200/40 overflow-hidden relative group transition-all hover:translate-y-[-2px]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-4xl font-black text-ink mt-2">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.color} shadow-sm border`}>
                  {stat.icon}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-current opacity-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Request List */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2 px-2">
           <Layers size={16} className="text-slate-400" />
           <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">所有待办事项</span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">
            正在同步审批队列...
          </div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">
            没有找到相关的审批请求
          </div>
        ) : (
          requests.map((r) => (
            <Card key={r.id} className="border-none shadow-md shadow-slate-100 group hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 rounded-3xl overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-stretch">
                  <div className={cn("w-1.5 shrink-0 transition-opacity group-hover:opacity-100 opacity-60", 
                    r.status === 'pending' ? 'bg-amber-400' : 
                    r.status === 'approved' ? 'bg-emerald-400' : 
                    r.status === 'rejected' ? 'bg-red-400' : 'bg-slate-300'
                  )} />
                  
                  <div className="flex-1 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex-1 flex gap-4 overflow-hidden">
                       <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                         <User size={20} />
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-bold text-ink truncate text-lg group-hover:text-indigo-600 transition-colors">
                              {r.process?.name ?? '标准审批请求'}
                            </h3>
                            <Badge variant="outline" className={cn("rounded-full px-2.5 py-0 text-[10px] font-bold border-none", STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-500')}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary font-medium">
                            <span className="flex items-center gap-1">
                              对象: <span className="text-ink font-bold uppercase">{r.objectApiName}</span>
                            </span>
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                            <span className="flex items-center gap-1">
                              提交人: <span className="text-ink font-bold">{r.submitter?.displayName || "未知"}</span>
                            </span>
                            {r.currentStep && (
                              <>
                                <span className="h-1 w-1 rounded-full bg-slate-200" />
                                <span className="flex items-center gap-1">
                                  当前步骤: <span className="text-indigo-600 font-bold">{r.currentStep.name}</span>
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                            <Clock size={10} /> 提交于 {fmtDate(r.submittedAt ?? r.createdAt)}
                          </p>
                       </div>
                    </div>

                    {r.status === 'pending' && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-50 mt-4 md:mt-0">
                        <Input
                          className="h-10 text-xs w-full sm:w-48 bg-slate-50/50 border-slate-100 focus:bg-white transition-all rounded-xl"
                          placeholder="输入审批备注说明..."
                          value={comment[r.id] ?? ''}
                          onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))}
                        />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate({ id: r.id, c: comment[r.id] })}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-6 rounded-xl shadow-lg shadow-emerald-100 flex-1 sm:flex-none"
                            disabled={approveMutation.isPending}
                          >
                            批准
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectMutation.mutate({ id: r.id, c: comment[r.id] })}
                            className="text-red-500 border-red-100 hover:bg-red-50 font-bold h-10 px-6 rounded-xl flex-1 sm:flex-none"
                            disabled={rejectMutation.isPending}
                          >
                            驳回
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => recallMutation.mutate({ id: r.id })}
                            className="text-slate-400 hover:text-slate-600 h-10 w-10 p-0 rounded-xl"
                            disabled={recallMutation.isPending}
                          >
                            <RotateCcw size={16} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

