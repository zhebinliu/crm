'use client';
// /admin/sla-policies — SLA 策略 admin (Wave 20h)
// Table + create/edit modal with caseFilter JSON, businessHours per-day, holidays.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { slaApi } from '@/lib/api';
import { fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Clock, Plus, Pencil, Trash2, Loader2, Save, X,
} from 'lucide-react';

interface SlaPolicy {
  id: string;
  apiName: string;
  label: string;
  description: string | null;
  caseFilter: Record<string, unknown> | null;
  businessHours: Record<string, unknown> | null;
  holidays: string[];
  firstResponseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

const DOWS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DOW_LABEL: Record<string, string> = {
  mon: '周一', tue: '周二', wed: '周三', thu: '周四',
  fri: '周五', sat: '周六', sun: '周日',
};

interface FormState {
  id?: string;
  apiName: string;
  label: string;
  description: string;
  caseFilterJson: string;
  timezone: string;
  hours: Record<string, { start: string; end: string; enabled: boolean }>;
  holidaysInput: string;
  holidays: string[];
  firstResponseTargetMinutes: number;
  resolutionTargetMinutes: number;
  priority: number;
  isActive: boolean;
}

function emptyForm(): FormState {
  const hours: FormState['hours'] = {};
  for (const d of DOWS) {
    const isWeekday = d !== 'sat' && d !== 'sun';
    hours[d] = { start: '09:00', end: '18:00', enabled: isWeekday };
  }
  return {
    apiName: '',
    label: '',
    description: '',
    caseFilterJson: '{}',
    timezone: 'Asia/Shanghai',
    hours,
    holidaysInput: '',
    holidays: [],
    firstResponseTargetMinutes: 60,
    resolutionTargetMinutes: 60 * 24,
    priority: 100,
    isActive: true,
  };
}

function fromPolicy(p: SlaPolicy): FormState {
  const base = emptyForm();
  const bh = (p.businessHours ?? {}) as Record<string, unknown>;
  for (const d of DOWS) {
    const slot = bh[d] as { start?: string; end?: string } | undefined;
    if (slot && slot.start && slot.end) {
      base.hours[d] = { start: slot.start, end: slot.end, enabled: true };
    } else {
      base.hours[d] = { ...base.hours[d], enabled: false };
    }
  }
  return {
    ...base,
    id: p.id,
    apiName: p.apiName,
    label: p.label,
    description: p.description ?? '',
    caseFilterJson: JSON.stringify(p.caseFilter ?? {}, null, 2),
    timezone: (bh.timezone as string) ?? 'Asia/Shanghai',
    holidays: p.holidays ?? [],
    firstResponseTargetMinutes: p.firstResponseTargetMinutes ?? 60,
    resolutionTargetMinutes: p.resolutionTargetMinutes ?? 60 * 24,
    priority: p.priority ?? 100,
    isActive: p.isActive,
  };
}

function toPayload(f: FormState, isCreate: boolean): Record<string, unknown> {
  let caseFilter: Record<string, unknown> | undefined;
  try {
    caseFilter = f.caseFilterJson.trim() ? JSON.parse(f.caseFilterJson) : undefined;
  } catch {
    caseFilter = undefined;
  }
  const businessHours: Record<string, unknown> = { timezone: f.timezone };
  for (const d of DOWS) {
    if (f.hours[d].enabled) {
      businessHours[d] = { start: f.hours[d].start, end: f.hours[d].end };
    }
  }
  const payload: Record<string, unknown> = {
    label: f.label,
    description: f.description || undefined,
    caseFilter,
    businessHours,
    holidays: f.holidays,
    firstResponseTargetMinutes: f.firstResponseTargetMinutes,
    resolutionTargetMinutes: f.resolutionTargetMinutes,
    priority: f.priority,
    isActive: f.isActive,
  };
  if (isCreate) payload.apiName = f.apiName;
  return payload;
}

export default function SlaPoliciesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [mode, setMode] = useState<'create' | 'edit'>('create');

  const listQ = useQuery<SlaPolicy[] | { data: SlaPolicy[] }>({
    queryKey: ['sla-policies'],
    queryFn: () => slaApi.listPolicies(),
  });

  const policies = useMemo(() => {
    const raw = listQ.data;
    return Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  }, [listQ.data]) as SlaPolicy[];

  const createMut = useMutation({
    mutationFn: (d: unknown) => slaApi.createPolicy(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      setOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: unknown }) => slaApi.updatePolicy(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      setOpen(false);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => slaApi.deletePolicy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla-policies'] }),
  });

  function startCreate() {
    setMode('create');
    setForm(emptyForm());
    setOpen(true);
  }
  function startEdit(p: SlaPolicy) {
    setMode('edit');
    setForm(fromPolicy(p));
    setOpen(true);
  }

  function save() {
    const payload = toPayload(form, mode === 'create');
    if (mode === 'create') createMut.mutate(payload);
    else if (form.id) updateMut.mutate({ id: form.id, d: payload });
  }

  function addHoliday() {
    const d = form.holidaysInput.trim();
    if (!d || form.holidays.includes(d)) return;
    setForm({ ...form, holidays: [...form.holidays, d], holidaysInput: '' });
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Clock size={20} />
            </div>
            SLA 策略
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            为不同优先级 / 客户分层定义首次响应与解决时效
          </p>
        </div>
        <Button
          className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
          onClick={startCreate}
        >
          <Plus size={14} /> 新建策略
        </Button>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : policies.length === 0 ? (
            <div className="p-16 text-center">
              <Clock size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">尚未定义任何 SLA 策略</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">apiName</th>
                  <th className="px-6 py-3 text-left">名称</th>
                  <th className="px-6 py-3 text-center">启用</th>
                  <th className="px-6 py-3 text-right">优先级</th>
                  <th className="px-6 py-3 text-right">首响 (分钟)</th>
                  <th className="px-6 py-3 text-right">解决 (分钟)</th>
                  <th className="px-6 py-3 text-right">更新</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-xs font-mono font-black text-slate-500">{p.apiName}</td>
                    <td className="px-6 py-3 text-sm font-bold text-ink">{p.label}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={cn(
                        'text-[10px] font-black px-2 py-0.5 rounded-full',
                        p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                      )}>
                        {p.isActive ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-right tabular-nums">{p.priority}</td>
                    <td className="px-6 py-3 text-sm font-bold text-right tabular-nums">
                      {p.firstResponseTargetMinutes ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-right tabular-nums">
                      {p.resolutionTargetMinutes ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(p.updatedAt)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 rounded-lg font-bold gap-1 text-[11px]"
                          onClick={() => startEdit(p)}
                        >
                          <Pencil size={10} /> 编辑
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 rounded-lg font-bold gap-1 text-[11px] hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => {
                            if (confirm(`删除策略「${p.label}」？`)) deleteMut.mutate(p.id);
                          }}
                        >
                          <Trash2 size={10} /> 删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Clock size={18} /> {mode === 'create' ? '新建 SLA 策略' : `编辑：${form.label}`}
            </DialogTitle>
            <DialogDescription>定义工作日历、案件过滤条件和时效目标</DialogDescription>
          </DialogHeader>

          {(createMut.error || updateMut.error) && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold">
              保存失败：{((createMut.error ?? updateMut.error) as Error).message}
            </div>
          )}

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">apiName *</Label>
                <Input
                  value={form.apiName}
                  onChange={(e) => setForm({ ...form, apiName: e.target.value })}
                  disabled={mode === 'edit'}
                  placeholder="enterprise_24x7"
                  className="h-10 rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">名称 *</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="企业级 7×24"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-xl min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">首响目标 (分钟)</Label>
                <Input
                  type="number"
                  value={form.firstResponseTargetMinutes}
                  onChange={(e) => setForm({ ...form, firstResponseTargetMinutes: Number(e.target.value) })}
                  className="h-10 rounded-xl tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">解决目标 (分钟)</Label>
                <Input
                  type="number"
                  value={form.resolutionTargetMinutes}
                  onChange={(e) => setForm({ ...form, resolutionTargetMinutes: Number(e.target.value) })}
                  className="h-10 rounded-xl tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">优先级</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  className="h-10 rounded-xl tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">案件过滤条件 (JSON)</Label>
              <Textarea
                value={form.caseFilterJson}
                onChange={(e) => setForm({ ...form, caseFilterJson: e.target.value })}
                className="rounded-xl min-h-[100px] font-mono text-xs"
                placeholder={'{\n  "priority": ["URGENT", "HIGH"]\n}'}
              />
              <p className="text-[11px] text-slate-400 font-bold">
                例：<code className="font-mono">{'{ "priority": ["URGENT", "HIGH"] }'}</code>
              </p>
            </div>

            {/* Business hours */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">工作时间</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] font-bold text-slate-400">时区</Label>
                  <Input
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="h-7 w-44 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                {DOWS.map((d) => (
                  <div key={d} className="flex items-center gap-3 p-2.5">
                    <label className="inline-flex items-center gap-2 w-24 text-sm font-bold text-ink">
                      <input
                        type="checkbox"
                        checked={form.hours[d].enabled}
                        onChange={(e) => setForm({
                          ...form,
                          hours: { ...form.hours, [d]: { ...form.hours[d], enabled: e.target.checked } },
                        })}
                        className="accent-brand"
                      />
                      {DOW_LABEL[d]}
                    </label>
                    <Input
                      type="time"
                      value={form.hours[d].start}
                      onChange={(e) => setForm({
                        ...form,
                        hours: { ...form.hours, [d]: { ...form.hours[d], start: e.target.value } },
                      })}
                      disabled={!form.hours[d].enabled}
                      className="h-8 w-32 rounded-lg font-mono"
                    />
                    <span className="text-xs text-slate-400">至</span>
                    <Input
                      type="time"
                      value={form.hours[d].end}
                      onChange={(e) => setForm({
                        ...form,
                        hours: { ...form.hours, [d]: { ...form.hours[d], end: e.target.value } },
                      })}
                      disabled={!form.hours[d].enabled}
                      className="h-8 w-32 rounded-lg font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Holidays */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">法定节假日 (ISO 日期)</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={form.holidaysInput}
                  onChange={(e) => setForm({ ...form, holidaysInput: e.target.value })}
                  className="h-9 rounded-xl flex-1 font-mono"
                />
                <Button variant="outline" className="h-9 rounded-xl font-bold" onClick={addHoliday}>
                  添加
                </Button>
              </div>
              {form.holidays.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.holidays.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700"
                    >
                      {h}
                      <button
                        onClick={() => setForm({ ...form, holidays: form.holidays.filter((x) => x !== h) })}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="accent-brand"
              />
              启用此策略
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>取消</Button>
            <Button
              className="rounded-xl bg-ink hover:bg-slate-800 text-white gap-1.5"
              onClick={save}
              disabled={createMut.isPending || updateMut.isPending || !form.label}
            >
              <Save size={14} /> 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
