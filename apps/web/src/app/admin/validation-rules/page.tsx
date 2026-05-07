'use client';
// ─── /admin/validation-rules ──────────────────────────────────────────────
// Salesforce-style validation rules: when a save would violate the rule's
// condition tree, the API rejects with errorMessage. Backend enforcement
// already exists in ValidationRuleService; this page is the missing UI.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldAlert, Plus, Pencil, Trash2, Loader2, AlertCircle, ToggleLeft, ToggleRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationRule {
  id: string;
  name: string;
  description: string | null;
  objectApiName: string;
  conditions: unknown;
  errorMessage: string;
  errorField: string | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

const STD_OBJECTS = [
  { value: 'Lead', label: '线索' },
  { value: 'Account', label: '客户' },
  { value: 'Contact', label: '联系人' },
  { value: 'Opportunity', label: '商机' },
  { value: 'Quote', label: '报价单' },
  { value: 'Order', label: '订单' },
  { value: 'Contract', label: '合同' },
  { value: 'Activity', label: '活动' },
];

const OPS = [
  { value: 'eq',         label: '等于 ==' },
  { value: 'neq',        label: '不等于 !=' },
  { value: 'gt',         label: '大于 >' },
  { value: 'gte',        label: '大于等于 >=' },
  { value: 'lt',         label: '小于 <' },
  { value: 'lte',        label: '小于等于 <=' },
  { value: 'contains',   label: '文本包含' },
  { value: 'startsWith', label: '文本开头是' },
  { value: 'is_blank',   label: '为空' },
  { value: 'is_not_blank', label: '非空' },
];

export default function ValidationRulesPage() {
  const qc = useQueryClient();
  const [filterObj, setFilterObj] = useState<string>('');
  const [editing, setEditing] = useState<ValidationRule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery<ValidationRule[]>({
    queryKey: ['validation-rules', filterObj],
    queryFn: () => workflowApi.listValidation(filterObj ? { objectApiName: filterObj } : {}),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      workflowApi.updateValidation(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['validation-rules'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => workflowApi.deleteValidation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['validation-rules'] }),
  });

  const rules = data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
              <ShieldAlert size={20} />
            </div>
            校验规则
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            当某条记录不满足规则条件时，保存会被阻止并显示自定义错误信息
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-11 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-white gap-2 shadow-lg shadow-amber-200/40"
        >
          <Plus size={15} /> 新建校验规则
        </Button>
      </div>

      {/* Object filter */}
      <div className="flex items-center gap-2">
        <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">对象类型</Label>
        <Select value={filterObj || '__all'} onValueChange={(v) => setFilterObj(v === '__all' ? '' : v)}>
          <SelectTrigger className="w-48 h-9 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">全部</SelectItem>
            {STD_OBJECTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="p-16 text-center">
              <ShieldAlert size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">暂无校验规则</p>
              <p className="text-xs text-slate-400 mt-1">点击右上角创建第一条规则</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rules.map((r) => (
                <li key={r.id} className="px-6 py-4 hover:bg-slate-50/50">
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}
                      className="mt-1 shrink-0"
                      title={r.isActive ? '停用' : '启用'}
                    >
                      {r.isActive
                        ? <ToggleRight size={22} className="text-emerald-500" />
                        : <ToggleLeft size={22} className="text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-black text-ink">{r.name}</span>
                        <Badge variant="outline" className={cn(
                          'border-none text-[10px] font-black uppercase tracking-wider',
                          r.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400',
                        )}>
                          {r.isActive ? '启用中' : '已停用'}
                        </Badge>
                        <Badge variant="outline" className="border-none text-[10px] font-bold bg-slate-100 text-slate-600">
                          {STD_OBJECTS.find((o) => o.value === r.objectApiName)?.label ?? r.objectApiName}
                        </Badge>
                        <span className="text-[11px] font-bold text-slate-400 ml-auto">优先级 {r.priority}</span>
                      </div>
                      {r.description && (
                        <p className="text-xs font-medium text-slate-500 mb-1.5">{r.description}</p>
                      )}
                      <div className="text-xs text-amber-700 font-bold flex items-start gap-1.5 mb-1.5">
                        <AlertCircle size={11} className="mt-0.5 shrink-0" />
                        <span>错误提示：{r.errorMessage}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        条件: {summarizeConditions(r.conditions)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => setEditing(r)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg text-red-500 hover:bg-red-50"
                        onClick={() => { if (confirm(`删除规则「${r.name}」？`)) remove.mutate(r.id); }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(createOpen || editing) && (
        <RuleFormDialog
          open
          rule={editing}
          onClose={() => { setEditing(null); setCreateOpen(false); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['validation-rules'] });
            setEditing(null); setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Form dialog ──────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  objectApiName: string;
  errorMessage: string;
  errorField: string;
  priority: number;
  conditions: { all: { field: string; op: string; value: string }[] };
}

function RuleFormDialog({
  open, rule, onClose, onSaved,
}: {
  open: boolean;
  rule: ValidationRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!rule;
  const [form, setForm] = useState<FormState>(() => {
    if (rule) {
      const c = rule.conditions as { all?: { field: string; op: string; value: unknown }[] } | null;
      return {
        name: rule.name,
        description: rule.description ?? '',
        objectApiName: rule.objectApiName,
        errorMessage: rule.errorMessage,
        errorField: rule.errorField ?? '',
        priority: rule.priority,
        conditions: {
          all: (c?.all ?? []).map((cd) => ({
            field: cd.field,
            op: cd.op,
            value: cd.value == null ? '' : String(cd.value),
          })),
        },
      };
    }
    return {
      name: '', description: '', objectApiName: 'Opportunity',
      errorMessage: '', errorField: '', priority: 0,
      conditions: { all: [{ field: '', op: 'eq', value: '' }] },
    };
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        objectApiName: form.objectApiName,
        errorMessage: form.errorMessage.trim(),
        errorField: form.errorField.trim() || undefined,
        priority: form.priority,
        conditions: {
          all: form.conditions.all
            .filter((c) => c.field.trim())
            .map((c) => ({ field: c.field.trim(), op: c.op, value: c.value })),
        },
      };
      return rule
        ? workflowApi.updateValidation(rule.id, payload)
        : workflowApi.createValidation(payload);
    },
    onSuccess: onSaved,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.errorMessage.trim()) return;
    save.mutate();
  }

  function updateCondition(idx: number, key: 'field' | 'op' | 'value', val: string) {
    const next = [...form.conditions.all];
    next[idx] = { ...next[idx]!, [key]: val };
    setForm({ ...form, conditions: { all: next } });
  }

  function addCondition() {
    setForm({
      ...form,
      conditions: { all: [...form.conditions.all, { field: '', op: 'eq', value: '' }] },
    });
  }

  function removeCondition(idx: number) {
    setForm({
      ...form,
      conditions: { all: form.conditions.all.filter((_, i) => i !== idx) },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={15} />
            </div>
            {isEdit ? '编辑校验规则' : '新建校验规则'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">规则名称 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">对象类型 *</Label>
              <Select value={form.objectApiName} onValueChange={(v) => setForm({ ...form, objectApiName: v })} disabled={isEdit}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STD_OBJECTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">规则描述</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" placeholder="可选，对管理员的备注" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">阻止条件 (满足以下全部时阻止保存)</Label>
            <div className="space-y-2">
              {form.conditions.all.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="字段路径，如 stage / amount"
                    value={c.field}
                    onChange={(e) => updateCondition(i, 'field', e.target.value)}
                    className="rounded-xl font-mono text-sm flex-1"
                  />
                  <Select value={c.op} onValueChange={(v) => updateCondition(i, 'op', v)}>
                    <SelectTrigger className="rounded-xl w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {c.op !== 'is_blank' && c.op !== 'is_not_blank' && (
                    <Input
                      placeholder="值"
                      value={c.value}
                      onChange={(e) => updateCondition(i, 'value', e.target.value)}
                      className="rounded-xl font-mono text-sm flex-1"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-lg text-red-400 hover:bg-red-50"
                    onClick={() => removeCondition(i)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl font-bold text-xs gap-1"
                onClick={addCondition}
              >
                <Plus size={12} /> 添加条件
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">错误提示文字 *</Label>
              <Textarea
                value={form.errorMessage}
                onChange={(e) => setForm({ ...form, errorMessage: e.target.value })}
                className="rounded-xl resize-none"
                rows={2}
                placeholder="例如：金额必须大于 0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">错误关联字段</Label>
              <Input
                value={form.errorField}
                onChange={(e) => setForm({ ...form, errorField: e.target.value })}
                className="rounded-xl font-mono text-sm"
                placeholder="可选，如 amount"
              />
              <p className="text-[10px] text-slate-400 font-medium">前端可在该字段下显示错误</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">优先级（数字越大越先评估）</Label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
              className="rounded-xl w-32"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl font-bold" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              className="rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
              disabled={save.isPending || !form.name.trim() || !form.errorMessage.trim()}
            >
              {save.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
              {isEdit ? '保存修改' : '创建规则'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Compact one-liner of conditions for list view.
function summarizeConditions(c: unknown): string {
  if (!c || typeof c !== 'object') return '—';
  const all = (c as { all?: { field: string; op: string; value: unknown }[] }).all;
  if (!Array.isArray(all) || all.length === 0) return '—';
  return all.map((x) => `${x.field} ${x.op}${x.value !== undefined ? ` "${x.value}"` : ''}`).join(' AND ');
}
