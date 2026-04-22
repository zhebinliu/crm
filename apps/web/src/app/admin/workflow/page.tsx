'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Plus, Search, RefreshCw, Pencil, Trash2, ToggleLeft, ToggleRight, MoreVertical, Zap } from 'lucide-react';
import { RuleFormModal } from './rule-form-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OBJECTS = ['', 'lead', 'account', 'contact', 'opportunity', 'quote', 'order', 'contract', 'activity'];

interface Rule {
  id: string;
  name: string;
  description?: string;
  objectApiName: string;
  trigger: string;
  isActive: boolean;
  priority: number;
  conditions: unknown;
  actions: unknown;
  createdAt: string;
}

export default function AdminWorkflowPage() {
  const qc = useQueryClient();
  const [object, setObject] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRule, setEditRule] = useState<Rule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-rules', object],
    queryFn: () => workflowApi.listRules({ objectApiName: object || undefined }),
  });

  const rules: Rule[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workflowApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      workflowApi.updateRule(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });

  const TRIGGER_LABEL: Record<string, string> = {
    ON_CREATE: '创建时',
    ON_UPDATE: '更新时',
    ON_FIELD_CHANGE: '字段变更',
    ON_DELETE: '删除时',
  };

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">工作流规则</h1>
            <p className="text-sm text-ink-secondary mt-1">配置自动化业务逻辑，实现降本增效。</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/10">
          <Plus className="mr-2 h-4 w-4" /> 新建规则
        </Button>
      </div>

      {/* Filters & Content */}
      <Card className="border-none shadow-xl shadow-slate-200/40 bg-white/70 backdrop-blur-md overflow-hidden">
        <CardHeader className="border-b border-slate-50 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full max-w-sm">
              <Select value={object} onValueChange={setObject}>
                <SelectTrigger className="w-[180px] h-10 bg-white/50 border-slate-200">
                  <SelectValue placeholder="全部对象" />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTS.map((o) => (
                    <SelectItem key={o} value={o || "ALL"}>
                      {o || '全部对象'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ['workflow-rules'] })} className="h-10 w-10">
              <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold text-slate-500 py-3 pl-6">规则名称</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">所属对象</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">触发时机</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">优先级</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">状态</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">创建日期</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                    正在分析工作流规则...
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                    未配置任何自动化规则
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id} className="group transition-colors hover:bg-slate-50/50">
                    <TableCell className="py-4 pl-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink text-sm">{r.name}</span>
                        <span className="text-[11px] text-ink-secondary truncate max-w-[200px]">{r.description || "暂无描述"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none font-semibold px-2 py-0">
                        {r.objectApiName.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                       <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-none font-semibold px-2 py-0">
                        {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-secondary text-sm font-medium">
                      {r.priority}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleMutation.mutate({ id: r.id, isActive: !r.isActive })}
                        className={`flex items-center gap-2 text-xs font-bold transition-colors ${r.isActive ? 'text-emerald-600' : 'text-slate-300'}`}
                      >
                        {r.isActive ? <ToggleRight size={20} className="fill-emerald-100" /> : <ToggleLeft size={20} />}
                        {r.isActive ? '运行中' : '已停用'}
                      </button>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">
                       {fmtDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical size={16} className="text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={() => setEditRule(r)} className="cursor-pointer gap-2">
                             <Pencil size={14} /> 编辑规则
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => { if (confirm(`确认删除规则 "${r.name}"？`)) deleteMutation.mutate(r.id); }}
                            className="text-danger focus:text-danger cursor-pointer gap-2"
                          >
                             <Trash2 size={14} /> 删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modals */}
      {showCreate && <RuleFormModal onClose={() => setShowCreate(false)} />}
      {editRule && <RuleFormModal rule={editRule as any} onClose={() => setEditRule(null)} />}
    </div>
  );
}

