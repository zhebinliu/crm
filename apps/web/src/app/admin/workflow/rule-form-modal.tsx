'use client';
import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { workflowApi, adminApi } from '@/lib/api';
import { X, Plus, Trash2, Zap, Settings2, PlayCircle, Eye, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';

const OBJECTS = ['lead', 'account', 'contact', 'opportunity', 'quote', 'order', 'contract', 'activity'];
const TRIGGERS = [
  { value: 'ON_CREATE', label: '记录创建时' },
  { value: 'ON_UPDATE', label: '记录更新时' },
  { value: 'ON_FIELD_CHANGE', label: '特定字段变更时' },
  { value: 'ON_DELETE', label: '记录删除时' },
];

const OPS = [
  { value: 'eq', label: '等于 (==)' },
  { value: 'neq', label: '不等于 (!=)' },
  { value: 'gt', label: '数值大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lt', label: '数值小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
  { value: 'contains', label: '文本包含' },
  { value: 'startsWith', label: '文字开头是' },
];

const ACTION_TYPES = [
  { value: 'update_field', label: '更新字段值' },
  { value: 'create_task', label: '自动创建任务' },
  { value: 'send_email', label: '发送通知邮件' },
];

interface Rule {
  id?: string;
  name: string;
  description?: string;
  objectApiName: string;
  trigger: string;
  conditions: any;
  actions: any;
  isActive: boolean;
  priority: number;
}

export function RuleFormModal({ rule, onClose }: { rule?: Rule; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!rule?.id;

  const initialConditions = (() => {
    if (!rule?.conditions) return { all: [] };
    if (typeof rule.conditions === 'string') {
      try { return JSON.parse(rule.conditions); } catch { return { all: [] }; }
    }
    return rule.conditions;
  })();

  const initialActions = (() => {
    if (!rule?.actions) return [];
    if (typeof rule.actions === 'string') {
      try { return JSON.parse(rule.actions); } catch { return []; }
    }
    return rule.actions;
  })();

  const [form, setForm] = useState({
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    objectApiName: rule?.objectApiName ?? 'lead',
    trigger: rule?.trigger ?? 'ON_CREATE',
    isActive: rule?.isActive ?? true,
    priority: rule?.priority ?? 100,
  });

  const [conditions, setConditions] = useState<{ all: any[] }>(initialConditions);
  const [actions, setActions] = useState<any[]>(initialActions);
  const [error, setError] = useState('');

  // Fetch fields for the selected object to help with autocomplete
  const { data: objectDef } = useQuery({
    queryKey: ['admin-object', form.objectApiName],
    queryFn: () => adminApi.getObject(form.objectApiName),
    enabled: !!form.objectApiName,
  });
  const fields = objectDef?.fields ?? [];

  const mutation = useMutation({
    mutationFn: async () => {
      const cleanedConditions = {
        all: conditions.all.map(c => ({
          ...c,
          value: !isNaN(Number(c.value)) && c.value !== '' ? Number(c.value) : c.value === 'true' ? true : c.value === 'false' ? false : c.value
        }))
      };

      const payload = {
        ...form,
        conditions: cleanedConditions,
        actions: actions,
      };
      if (isEdit) return workflowApi.updateRule(rule!.id!, payload);
      return workflowApi.createRule(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-rules'] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.message;
      setError(msg ?? '保存失败，请检查配置参数');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] p-0 border-none shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="p-6 bg-slate-50/50 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
               <Zap size={20} />
             </div>
             <div>
                <DialogTitle className="text-xl font-bold text-ink">
                  {isEdit ? '编辑自动化规则' : '创建新自动化规则'}
                </DialogTitle>
                <p className="text-xs text-ink-secondary mt-0.5">定义触发时机与执行动作，构建企业自动化流程。</p>
             </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <form id="rule-form" onSubmit={handleSubmit} className="space-y-10 pb-4">
            {/* 1. Basic Info */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                 <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-500 font-bold border-slate-200">STEP 1</Badge>
                 <h3 className="font-bold text-ink flex items-center gap-2">基础定义</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-ink-secondary">规则名称 *</Label>
                  <Input 
                    required 
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} 
                    placeholder="例如：高净值客户自动评分"
                    className="h-10 border-slate-200 focus:ring-brand focus:border-brand" 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-ink-secondary">作用对象 *</Label>
                    <Select value={form.objectApiName} onValueChange={(val) => setForm({ ...form, objectApiName: val })}>
                      <SelectTrigger className="h-10 border-slate-200 uppercase font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OBJECTS.map((o) => (
                          <SelectItem key={o} value={o} className="uppercase">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-ink-secondary">触发时机 *</Label>
                    <Select value={form.trigger} onValueChange={(val) => setForm({ ...form, trigger: val })}>
                      <SelectTrigger className="h-10 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIGGERS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label className="text-xs font-semibold text-ink-secondary">规则描述</Label>
                  <Input 
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} 
                    placeholder="简述此自动化规则的目标与逻辑..."
                    className="h-10 border-slate-200" 
                  />
                </div>

                <div className="flex items-center gap-6 pt-2">
                   <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="is-active" 
                        checked={form.isActive} 
                        onCheckedChange={(checked) => setForm({ ...form, isActive: !!checked })}
                      />
                      <Label htmlFor="is-active" className="text-xs font-bold text-ink cursor-pointer">立即启用</Label>
                   </div>
                   <div className="flex items-center gap-3">
                      <Label className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">执行优先级</Label>
                      <Input 
                        type="number" 
                        className="w-20 h-8 text-center font-bold border-slate-200" 
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                      />
                   </div>
                </div>
              </div>
            </section>

            <Separator className="bg-slate-100" />

            {/* 2. Conditions */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-500 font-bold border-slate-200">STEP 2</Badge>
                   <h3 className="font-bold text-ink flex items-center gap-2">触发条件</h3>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setConditions({ all: [...conditions.all, { field: '', op: 'eq', value: '' }] })}
                  className="text-brand hover:text-white hover:bg-brand border-brand/20 h-8 gap-1.5"
                >
                  <Plus size={14} /> 添加条件
                </Button>
              </div>
              
              <div className="space-y-3">
                {conditions.all.length === 0 ? (
                  <div className="bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                    <p className="text-sm text-slate-400 font-medium">未设置具体条件，该规则将在每次触发时通过。</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conditions.all.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm transition-all hover:border-brand/30 group">
                        <Badge variant="secondary" className="h-6 w-6 rounded-full p-0 flex items-center justify-center bg-slate-100 text-slate-500 font-bold shrink-0">
                          {idx + 1}
                        </Badge>
                        
                        <div className="relative flex-1 group/input">
                          <Input
                            className="h-9 border-slate-100 bg-slate-50/30 font-mono text-xs focus:bg-white transition-all"
                            placeholder="字段 API Name (如: amount)"
                            value={cond.field}
                            onChange={(e) => {
                              const newAll = [...conditions.all];
                              newAll[idx].field = e.target.value;
                              setConditions({ all: newAll });
                            }}
                            list="field-list"
                          />
                        </div>

                        <Select
                          value={cond.op}
                          onValueChange={(val) => {
                            const newAll = [...conditions.all];
                            newAll[idx].op = val;
                            setConditions({ all: newAll });
                          }}
                        >
                          <SelectTrigger className="h-9 w-[160px] border-slate-100 bg-slate-50/30 text-xs font-semibold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPS.map(op => (
                              <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          className="h-9 flex-1 border-slate-100 bg-slate-50/30 text-xs focus:bg-white transition-all"
                          placeholder="目标值"
                          value={cond.value}
                          onChange={(e) => {
                            const newAll = [...conditions.all];
                            newAll[idx].value = e.target.value;
                            setConditions({ all: newAll });
                          }}
                        />

                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-300 hover:text-red-500 transition-colors"
                          onClick={() => setConditions({ all: conditions.all.filter((_, i) => i !== idx) })}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <datalist id="field-list">
                  {fields.map((f: any) => <option key={f.apiName} value={f.apiName}>{f.label}</option>)}
                </datalist>
              </div>
            </section>

            <Separator className="bg-slate-100" />

            {/* 3. Actions */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-500 font-bold border-slate-200">STEP 3</Badge>
                   <h3 className="font-bold text-ink flex items-center gap-2">执行动作</h3>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setActions([...actions, { type: 'update_field', params: {} }])}
                  className="text-indigo-600 hover:text-white hover:bg-indigo-600 border-indigo-200 h-8 gap-1.5"
                >
                  <Plus size={14} /> 添加动作
                </Button>
              </div>

              <div className="space-y-4">
                {actions.length === 0 ? (
                  <div className="bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 py-12 flex flex-col items-center justify-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-300 shadow-sm">
                      <PlayCircle size={20} />
                    </div>
                    <p className="text-sm text-slate-400 font-semibold tracking-wide">请至少关联一个自动化执行动作</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map((act, idx) => (
                      <div key={idx} className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-100/30 overflow-hidden group">
                        <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ACT {idx + 1}</span>
                            <Select
                              value={act.type}
                              onValueChange={(val) => {
                                const newActs = [...actions];
                                newActs[idx].type = val;
                                newActs[idx].params = {};
                                setActions(newActs);
                              }}
                            >
                              <SelectTrigger className="h-8 min-w-[140px] bg-white border-slate-200 text-xs font-bold text-indigo-600 focus:ring-indigo-500">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTION_TYPES.map(t => (
                                  <SelectItem key={t.value} value={t.value} className="text-xs font-semibold">{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-300 hover:text-red-500 transition-colors"
                            onClick={() => setActions(actions.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>

                        <div className="p-5 space-y-4">
                          {act.type === 'update_field' && (
                            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className="flex-1 space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">目标字段</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200 bg-slate-50/30" 
                                  placeholder="API Name"
                                  value={act.params?.field || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, field: e.target.value };
                                    setActions(newActs);
                                  }} 
                                  list="field-list" 
                                />
                              </div>
                              <div className="pt-5 text-slate-300 shrink-0">
                                <ChevronRight size={16} />
                              </div>
                              <div className="flex-1 space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">变更为</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200 bg-slate-50/30" 
                                  placeholder="新值"
                                  value={act.params?.value || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, value: e.target.value };
                                    setActions(newActs);
                                  }} 
                                />
                              </div>
                            </div>
                          )}
                          
                          {act.type === 'create_task' && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className="col-span-2 space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">任务主题</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200" 
                                  placeholder="输入任务描述..."
                                  value={act.params?.subject || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, subject: e.target.value };
                                    setActions(newActs);
                                  }} 
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">负责人 (可选 ID)</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200" 
                                  placeholder="User ID"
                                  value={act.params?.ownerId || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, ownerId: e.target.value };
                                    setActions(newActs);
                                  }} 
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">优先级</Label>
                                <Select 
                                  value={act.params?.priority || 'normal'}
                                  onValueChange={(val) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, priority: val };
                                    setActions(newActs);
                                  }}
                                >
                                  <SelectTrigger className="h-9 text-xs border-slate-200">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="normal">普通 (Normal)</SelectItem>
                                    <SelectItem value="high">紧急 (High)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          {act.type === 'send_email' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">收件人</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200" 
                                  placeholder="邮箱地址 或 变量 如 {record.owner.email}"
                                  value={act.params?.to || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, to: e.target.value };
                                    setActions(newActs);
                                  }} 
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-ink-secondary uppercase">邮件模板 (模板 ID)</Label>
                                <Input 
                                  className="h-9 text-xs border-slate-200" 
                                  placeholder="Email Template ID"
                                  value={act.params?.templateId || ''}
                                  onChange={(e) => {
                                    const newActs = [...actions];
                                    newActs[idx].params = { ...newActs[idx].params, templateId: e.target.value };
                                    setActions(newActs);
                                  }} 
                                />
                              </div>
                            </div>
                          )}
                          
                          {!['update_field', 'create_task', 'send_email'].includes(act.type) && (
                            <div className="space-y-1.5 font-mono">
                               <Label className="text-[10px] font-bold text-ink-secondary uppercase">动作参数 (JSON 格式)</Label>
                               <textarea 
                                 className="w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-xs focus:ring-1 focus:ring-brand outline-none" 
                                 rows={4} 
                                 placeholder='{"key": "value"}'
                                 value={typeof act.params === 'string' ? act.params : JSON.stringify(act.params || {}, null, 2)}
                                 onChange={(e) => {
                                   const newActs = [...actions];
                                   try { newActs[idx].params = JSON.parse(e.target.value); } 
                                   catch { newActs[idx].params = e.target.value; }
                                   setActions(newActs);
                                 }} 
                               />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </form>
        </div>

        {/* Footer Area */}
        <div className="p-6 shrink-0 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="max-w-[300px]">
             {error ? (
               <div className="flex items-center gap-2 text-red-600 animate-in fade-in slide-in-from-bottom-2">
                 <AlertCircle size={16} className="shrink-0" />
                 <span className="text-[11px] font-bold truncate leading-tight">{error}</span>
               </div>
             ) : (
               <div className="flex items-center gap-2 text-slate-400">
                 <Eye size={14} className="shrink-0" />
                 <span className="text-[11px] font-medium italic">所有的逻辑更改将在保存后立即生效。</span>
               </div>
             )}
          </div>
          <div className="flex items-center gap-3">
             <Button variant="ghost" onClick={onClose} disabled={mutation.isPending} className="text-slate-500 font-semibold">
               放弃更改
             </Button>
             <Button 
               form="rule-form"
               type="submit" 
               disabled={mutation.isPending} 
               className="bg-brand hover:bg-brand-deep text-white px-8 font-bold shadow-xl shadow-brand/20 transition-all active:scale-95"
             >
               {mutation.isPending ? (
                 <div className="flex items-center gap-2">
                   <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                   <span>正在同步规则...</span>
                 </div>
               ) : (
                 '保存自动化规则'
               )}
             </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

