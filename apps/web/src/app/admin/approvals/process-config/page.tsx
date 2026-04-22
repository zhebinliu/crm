'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalApi, adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Settings2, Shield, Layers,
  CheckCircle2, XCircle, Save, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalStep {
  id?: string;
  stepOrder: number;
  stepName: string;
  approvalType: 'SEQUENTIAL' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
  approverSource: 'USER' | 'ROLE' | 'MANAGER' | 'FIELD' | 'DYNAMIC';
  approverIds: string[];
  isRequired: boolean;
}

interface ApprovalProcess {
  id: string;
  name: string;
  description?: string;
  objectApiName: string;
  approvalType: string;
  isActive: boolean;
  entryConditions?: unknown;
  finalApprovalActions?: unknown;
  finalRejectionActions?: unknown;
  steps?: ApprovalStep[];
  _count?: { steps: number };
}

interface ObjectDef {
  apiName: string;
  label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APPROVAL_TYPES = [
  { value: 'SEQUENTIAL', label: '顺序审批' },
  { value: 'PARALLEL_ALL', label: '并行审批 (全部通过)' },
  { value: 'PARALLEL_ANY', label: '并行审批 (任一通过)' },
];

const APPROVER_SOURCES = [
  { value: 'USER', label: '指定用户' },
  { value: 'ROLE', label: '指定角色' },
  { value: 'MANAGER', label: '提交人上级' },
  { value: 'FIELD', label: '字段中的用户' },
  { value: 'DYNAMIC', label: '动态计算' },
];

// ─── New Process Dialog ───────────────────────────────────────────────────────

interface NewProcessDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objectNames: string[];
}

function NewProcessDialog({ open, onOpenChange, objectNames }: NewProcessDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    objectApiName: '',
    approvalType: 'SEQUENTIAL',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (d: typeof form) => approvalApi.createProcess(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-processes'] });
      onOpenChange(false);
      setForm({ name: '', description: '', objectApiName: '', approvalType: 'SEQUENTIAL' });
      setError('');
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error?.message ?? (err as any)?.message ?? '创建失败';
      setError(msg);
    },
  });

  function handleSave() {
    if (!form.name.trim()) { setError('审批流程名称不能为空'); return; }
    if (!form.objectApiName) { setError('请选择对象类型'); return; }
    setError('');
    createMutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Shield size={16} className="text-brand" /> 新建审批流程
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">流程名称 *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：销售合同审批流程"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">描述</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="可选说明"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">对象类型 *</Label>
            <Select value={form.objectApiName} onValueChange={(v) => setForm({ ...form, objectApiName: v })}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="选择关联对象..." />
              </SelectTrigger>
              <SelectContent>
                {objectNames.map((n) => (
                  <SelectItem key={n} value={n} className="font-mono text-xs uppercase">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">审批方式</Label>
            <Select value={form.approvalType} onValueChange={(v) => setForm({ ...form, approvalType: v })}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPROVAL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs font-medium">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-semibold">取消</Button>
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending}
            className="bg-brand hover:bg-brand-deep text-white font-bold px-6"
          >
            {createMutation.isPending ? '正在创建...' : '创建流程'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Step Dialog ──────────────────────────────────────────────────────────

interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextOrder: number;
  onAdd: (step: ApprovalStep) => void;
}

function AddStepDialog({ open, onOpenChange, nextOrder, onAdd }: AddStepDialogProps) {
  const [form, setForm] = useState<{
    stepName: string;
    approvalType: 'SEQUENTIAL' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
    approverSource: 'USER' | 'ROLE' | 'MANAGER' | 'FIELD' | 'DYNAMIC';
    approverIdsRaw: string;
    isRequired: boolean;
  }>({
    stepName: '',
    approvalType: 'SEQUENTIAL',
    approverSource: 'USER',
    approverIdsRaw: '',
    isRequired: true,
  });
  const [error, setError] = useState('');

  function handleAdd() {
    if (!form.stepName.trim()) { setError('步骤名称不能为空'); return; }
    setError('');
    const approverIds = form.approverIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onAdd({
      stepOrder: nextOrder,
      stepName: form.stepName,
      approvalType: form.approvalType,
      approverSource: form.approverSource,
      approverIds,
      isRequired: form.isRequired,
    });
    setForm({ stepName: '', approvalType: 'SEQUENTIAL', approverSource: 'USER', approverIdsRaw: '', isRequired: true });
    onOpenChange(false);
  }

  const showApproverIds = form.approverSource === 'USER' || form.approverSource === 'ROLE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Layers size={16} className="text-brand" /> 添加审批步骤
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">步骤名称 *</Label>
            <Input
              value={form.stepName}
              onChange={(e) => setForm({ ...form, stepName: e.target.value })}
              placeholder="例如：部门经理审批"
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">审批方式</Label>
              <Select
                value={form.approvalType}
                onValueChange={(v) => setForm({ ...form, approvalType: v as typeof form.approvalType })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">审批人来源</Label>
              <Select
                value={form.approverSource}
                onValueChange={(v) => setForm({ ...form, approverSource: v as typeof form.approverSource })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVER_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showApproverIds && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">
                {form.approverSource === 'USER' ? '用户 ID (逗号分隔)' : '角色 ID (逗号分隔)'}
              </Label>
              <Input
                value={form.approverIdsRaw}
                onChange={(e) => setForm({ ...form, approverIdsRaw: e.target.value })}
                placeholder="id1, id2, id3"
                className="h-10 font-mono text-xs"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="step-required"
              checked={form.isRequired}
              onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-brand"
            />
            <Label htmlFor="step-required" className="text-sm cursor-pointer font-medium">此步骤为必须完成</Label>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs font-medium">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-semibold">取消</Button>
          <Button onClick={handleAdd} className="bg-brand hover:bg-brand-deep text-white font-bold px-6">
            添加步骤
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Process Editor ───────────────────────────────────────────────────────────

interface ProcessEditorProps {
  process: ApprovalProcess;
  objectNames: string[];
  onSaved: () => void;
}

function ProcessEditor({ process, objectNames, onSaved }: ProcessEditorProps) {
  const qc = useQueryClient();
  const [settings, setSettings] = useState({
    name: process.name,
    objectApiName: process.objectApiName,
    isActive: process.isActive,
    entryConditions: process.entryConditions
      ? JSON.stringify(process.entryConditions, null, 2)
      : '{}',
    finalApprovalActions: process.finalApprovalActions
      ? JSON.stringify(process.finalApprovalActions, null, 2)
      : '[]',
    finalRejectionActions: process.finalRejectionActions
      ? JSON.stringify(process.finalRejectionActions, null, 2)
      : '[]',
  });
  const [steps, setSteps] = useState<ApprovalStep[]>(process.steps ?? []);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const updateMutation = useMutation({
    mutationFn: (d: unknown) => approvalApi.updateProcess(process.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-processes'] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
      onSaved();
    },
    onError: () => setSaveStatus('error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => approvalApi.deleteProcess(process.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-processes'] });
      onSaved();
    },
  });

  function handleSave() {
    setSaveStatus('saving');
    let parsedEntry: unknown = {};
    let parsedApproval: unknown = [];
    let parsedRejection: unknown = [];
    try { parsedEntry = JSON.parse(settings.entryConditions); } catch { /* keep default */ }
    try { parsedApproval = JSON.parse(settings.finalApprovalActions); } catch { /* keep default */ }
    try { parsedRejection = JSON.parse(settings.finalRejectionActions); } catch { /* keep default */ }

    updateMutation.mutate({
      name: settings.name,
      objectApiName: settings.objectApiName,
      isActive: settings.isActive,
      entryConditions: parsedEntry,
      finalApprovalActions: parsedApproval,
      finalRejectionActions: parsedRejection,
      steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
    });
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const next = [...steps];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSteps(next.map((s, i) => ({ ...s, stepOrder: i + 1 })));
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  }

  function addStep(step: ApprovalStep) {
    setSteps([...steps, step]);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <div>
          <h2 className="text-base font-bold text-ink">{settings.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono uppercase">{settings.objectApiName}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
              <CheckCircle2 size={14} /> 已保存
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-500 text-xs font-semibold">
              <XCircle size={14} /> 保存失败
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 border-red-100 hover:bg-red-50 font-semibold text-xs h-8"
            onClick={() => { if (confirm('确认删除此审批流程？')) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 size={13} className="mr-1" /> 删除
          </Button>
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-deep text-white font-bold h-8 px-4"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            <Save size={13} className="mr-1" />
            {saveStatus === 'saving' ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Scrollable editor body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* ── Section 1: Process Settings ── */}
        <section className="space-y-5">
          <SectionHeading icon={<Settings2 size={14} />} title="流程基本设置" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">流程名称</Label>
              <Input
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">关联对象</Label>
              <Select
                value={settings.objectApiName}
                onValueChange={(v) => setSettings({ ...settings, objectApiName: v })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {objectNames.map((n) => (
                    <SelectItem key={n} value={n} className="font-mono text-xs uppercase">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">准入条件 (JSON)</Label>
            <Textarea
              value={settings.entryConditions}
              onChange={(e) => setSettings({ ...settings, entryConditions: e.target.value })}
              className="font-mono text-xs h-24 resize-none"
              placeholder="{}"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="proc-active"
              checked={settings.isActive}
              onChange={(e) => setSettings({ ...settings, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-brand"
            />
            <Label htmlFor="proc-active" className="text-sm cursor-pointer font-medium">启用此审批流程</Label>
          </div>
        </section>

        <Separator className="bg-slate-100" />

        {/* ── Section 2: Steps ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading icon={<Layers size={14} />} title={`审批步骤 (${steps.length})`} />
            <Button
              size="sm"
              variant="outline"
              className="text-xs font-bold h-8 px-3 border-brand/30 text-brand hover:bg-brand/5"
              onClick={() => setAddStepOpen(true)}
            >
              <Plus size={13} className="mr-1" /> 添加步骤
            </Button>
          </div>

          {steps.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
              <Layers size={28} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm text-slate-400 font-medium">暂无审批步骤，点击「添加步骤」开始配置</p>
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 bg-slate-50/70 border border-slate-100 rounded-xl px-4 py-3 group hover:border-slate-200 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-brand/10 text-brand font-black text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-ink truncate">{step.stepName}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                        {step.approverSource}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                        {step.approvalType}
                      </span>
                      {!step.isRequired && (
                        <span className="text-[10px] text-slate-300 font-medium">可选</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-500"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-500"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => removeStep(idx)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 ml-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator className="bg-slate-100" />

        {/* ── Section 3: Actions ── */}
        <section className="space-y-4">
          <SectionHeading icon={<CheckCircle2 size={14} />} title="最终动作配置" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-emerald-500">批准后动作 (JSON 数组)</Label>
              <Textarea
                value={settings.finalApprovalActions}
                onChange={(e) => setSettings({ ...settings, finalApprovalActions: e.target.value })}
                className="font-mono text-xs h-28 resize-none border-emerald-100 focus-visible:ring-emerald-200"
                placeholder="[]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-red-400">拒绝后动作 (JSON 数组)</Label>
              <Textarea
                value={settings.finalRejectionActions}
                onChange={(e) => setSettings({ ...settings, finalRejectionActions: e.target.value })}
                className="font-mono text-xs h-28 resize-none border-red-100 focus-visible:ring-red-200"
                placeholder="[]"
              />
            </div>
          </div>
        </section>
      </div>

      <AddStepDialog
        open={addStepOpen}
        onOpenChange={setAddStepOpen}
        nextOrder={steps.length + 1}
        onAdd={addStep}
      />
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-brand">{icon}</span>
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</h3>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalProcessConfigPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newProcessOpen, setNewProcessOpen] = useState(false);

  const { data: processesData, isLoading: procLoading } = useQuery({
    queryKey: ['approval-processes'],
    queryFn: () => approvalApi.listProcesses(),
  });

  const { data: objectsData } = useQuery({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const processes: ApprovalProcess[] = processesData?.data ?? processesData ?? [];
  const objects: ObjectDef[] = objectsData?.data ?? objectsData ?? [];
  const objectNames: string[] = objects.map((o: ObjectDef) => o.apiName).filter(Boolean);

  const selected = processes.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── Left Panel: Process List ── */}
      <div className="w-80 border-r border-slate-100 overflow-y-auto flex flex-col bg-white">
        <div className="px-4 py-4 shrink-0 border-b border-slate-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
              <Shield size={16} className="text-brand" />
            </div>
            <div>
              <h1 className="text-sm font-black text-ink leading-tight">审批流程配置</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">管理全局审批流程</p>
            </div>
          </div>
          <Button
            onClick={() => setNewProcessOpen(true)}
            className="w-full bg-brand hover:bg-brand-deep text-white font-bold h-9 text-xs"
          >
            <Plus size={13} className="mr-1.5" /> 新建审批流程
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {procLoading ? (
            <div className="py-10 text-center text-slate-300 text-xs font-medium">加载中...</div>
          ) : processes.length === 0 ? (
            <div className="py-10 text-center text-slate-300 text-xs font-medium">
              <Shield size={28} className="mx-auto mb-2 text-slate-200" />
              暂无审批流程
            </div>
          ) : (
            processes.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'w-full text-left px-3 py-3 rounded-xl transition-all border text-sm',
                  selectedId === p.id
                    ? 'bg-brand/5 border-brand/20 text-brand shadow-sm'
                    : 'border-transparent hover:bg-slate-50 hover:border-slate-100 text-ink',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold leading-tight truncate flex-1">{p.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-[9px] font-bold px-1.5 py-0 h-4 border-none rounded-full',
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {p.isActive ? '启用' : '停用'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-mono text-slate-400 uppercase truncate">
                    {p.objectApiName}
                  </span>
                  <span className="text-slate-200">·</span>
                  <span className="text-[10px] text-slate-400">
                    {p._count?.steps ?? p.steps?.length ?? 0} 步骤
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel: Editor ── */}
      <div className="flex-1 overflow-y-auto bg-white">
        {selected ? (
          <ProcessEditor
            key={selected.id}
            process={selected}
            objectNames={objectNames}
            onSaved={() => {/* already invalidated */}}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
              <Settings2 size={28} className="text-slate-200" />
            </div>
            <p className="text-slate-400 font-semibold text-sm">从左侧选择一个审批流程进行编辑</p>
            <p className="text-slate-300 text-xs mt-1">或点击「新建审批流程」创建第一个流程</p>
          </div>
        )}
      </div>

      {/* New Process Dialog */}
      <NewProcessDialog
        open={newProcessOpen}
        onOpenChange={setNewProcessOpen}
        objectNames={objectNames}
      />
    </div>
  );
}
