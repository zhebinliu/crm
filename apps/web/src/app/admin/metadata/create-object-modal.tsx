'use client';
// ─── <CreateObjectModal> ───────────────────────────────────────────────────
// Lets the admin define a brand-new custom object. apiName must end with __c
// to follow the Salesforce-style convention; we auto-suggest from label.

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const API_NAME_RE = /^[a-z][a-z0-9_]*__c$/;

export function CreateObjectModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [labelPlural, setLabelPlural] = useState('');
  const [apiName, setApiName] = useState('');
  const [iconName, setIconName] = useState('Box');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset on open
  useEffect(() => {
    if (open) {
      setLabel(''); setLabelPlural(''); setApiName(''); setIconName('Box'); setErrors({});
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => adminApi.createObject({ apiName, label, labelPlural, iconName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-objects'] });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = Array.isArray(err.response?.data?.message)
        ? err.response.data.message.join('; ')
        : err.response?.data?.message ?? err.message ?? '创建失败';
      setErrors({ _global: msg });
    },
  });

  function autoSuggestApiName(label: string): string {
    if (!label) return '';
    // Convert Chinese / spaces to a generic prefix; user can edit before submitting.
    const ascii = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!ascii) return 'custom_object__c';
    return `${ascii}__c`;
  }

  function handleLabelChange(v: string) {
    setLabel(v);
    if (!labelPlural) setLabelPlural(v);
    if (!apiName || apiName === autoSuggestApiName(label)) {
      setApiName(autoSuggestApiName(v));
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!label.trim()) errs.label = '标签必填';
    if (!labelPlural.trim()) errs.labelPlural = '复数标签必填';
    if (!apiName.trim()) errs.apiName = 'API 名称必填';
    else if (!API_NAME_RE.test(apiName)) errs.apiName = 'API 名称必须以 __c 结尾，且只能包含小写字母、数字、下划线，必须以字母开头';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Plus size={17} />
            </div>
            创建自定义对象
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {errors._global && (
            <div className="p-3 rounded-xl bg-red-50 text-sm font-bold text-red-600 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {errors._global}
            </div>
          )}

          <Field
            label="对象标签"
            required
            error={errors.label}
            hint="例如：联系记录"
          >
            <Input
              className="rounded-xl font-bold"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="例如：联系记录"
              autoFocus
            />
          </Field>

          <Field
            label="复数标签"
            required
            error={errors.labelPlural}
            hint="列表页和导航中显示"
          >
            <Input
              className="rounded-xl font-bold"
              value={labelPlural}
              onChange={(e) => setLabelPlural(e.target.value)}
              placeholder="例如：联系记录"
            />
          </Field>

          <Field
            label="API 名称"
            required
            error={errors.apiName}
            hint="必须以 __c 结尾。系统自动从标签生成，可手动修改。"
          >
            <Input
              className="rounded-xl font-mono text-sm"
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              placeholder="例如：contact_record__c"
            />
          </Field>

          <Field label="图标" hint="lucide-react 图标名">
            <Input
              className="rounded-xl font-mono text-sm"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="例如：Box"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 rounded-xl font-bold"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 rounded-xl font-bold bg-brand hover:bg-brand-deep text-white gap-2"
              disabled={create.isPending}
            >
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              创建对象
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, error, hint, children }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error
        ? <p className="text-xs text-red-500 font-bold">{error}</p>
        : hint
          ? <p className="text-[11px] text-slate-400 font-medium">{hint}</p>
          : null}
    </div>
  );
}
