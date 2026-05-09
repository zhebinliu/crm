'use client';
// ─── <EditFieldModal> ─────────────────────────────────────────────────────
// Edit an existing FieldDef. apiName + type are immutable (changing them
// would migrate stored data). For PICKLIST / MULTI_PICKLIST, the picklist's
// values are loaded and editable inline.
//
// Standard (system) fields can only have their `label` changed — apiName,
// type, required, etc. are owned by code/seed.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PicklistValuesEditor, type PicklistValueDraft } from './picklist-values-editor';

interface FieldDefLite {
  id: string;
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  unique: boolean;
  isSystem: boolean;
  isCustom: boolean;
  helpText?: string | null;
  picklistId?: string | null;
  referenceTo?: string | null;
}

interface PicklistDetail {
  id: string;
  apiName: string;
  label: string;
  values: Array<{
    id?: string;
    value: string;
    label: string;
    color?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  }>;
}

interface Props {
  field: FieldDefLite;
  objectApiName: string;
  open: boolean;
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  STRING: '短文本', TEXT: '长文本', EMAIL: '邮箱', PHONE: '电话', URL: '链接',
  NUMBER: '整数', DECIMAL: '小数', CURRENCY: '货币',
  BOOLEAN: '布尔', DATE: '日期', DATETIME: '日期时间',
  PICKLIST: '下拉单选', MULTI_PICKLIST: '下拉多选',
  REFERENCE: '关联引用', FORMULA: '公式', JSON: '结构化 JSON',
};

export function EditFieldModal({ field, objectApiName, open, onClose }: Props) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(field.label);
  const [helpText, setHelpText] = useState(field.helpText ?? '');
  const [required, setRequired] = useState(field.required);
  const [error, setError] = useState('');

  // Picklist values local draft (for PICKLIST / MULTI_PICKLIST)
  const isPicklist = field.type === 'PICKLIST' || field.type === 'MULTI_PICKLIST';
  const [pkValues, setPkValues] = useState<PicklistValueDraft[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setLabel(field.label);
      setHelpText(field.helpText ?? '');
      setRequired(field.required);
      setError('');
    }
  }, [open, field]);

  // Load picklist details if applicable
  const { data: picklists } = useQuery<PicklistDetail[]>({
    queryKey: ['admin-picklists'],
    queryFn: () => adminApi.listPicklists(),
    enabled: open && isPicklist && !!field.picklistId,
    staleTime: 60_000,
  });

  // Seed picklist draft once data arrives
  useEffect(() => {
    if (!open || !isPicklist || !field.picklistId || !picklists) return;
    const pk = picklists.find((p) => p.id === field.picklistId);
    if (pk) {
      setPkValues((pk.values ?? []).map((v) => ({
        id: v.id,
        value: v.value,
        label: v.label,
        color: v.color ?? '',
        isActive: v.isActive !== false,
      })));
    }
  }, [open, isPicklist, field.picklistId, picklists]);

  const saveField = useMutation({
    mutationFn: () => adminApi.updateField(field.id, {
      label: label.trim(),
      helpText: helpText.trim() || null,
      ...(field.isSystem ? {} : { required }),
    }),
  });

  const savePicklistValues = useMutation({
    mutationFn: () => {
      if (!field.picklistId) throw new Error('当前字段未绑定下拉选项库');
      const valid = pkValues.filter((v) => v.value.trim() && v.label.trim());
      if (valid.length === 0) throw new Error('请至少保留一个有效的选项');
      return adminApi.upsertPicklistValues(
        field.picklistId,
        valid.map((v, i) => ({
          value: v.value.trim(),
          label: v.label.trim(),
          color: (v.color ?? '').trim() || undefined,
          displayOrder: i,
          isActive: v.isActive !== false,
        })),
      );
    },
  });

  async function handleSave() {
    setError('');
    try {
      await saveField.mutateAsync();
      if (isPicklist && field.picklistId && pkValues.length > 0) {
        await savePicklistValues.mutateAsync();
      }
      qc.invalidateQueries({ queryKey: ['admin-object', objectApiName] });
      qc.invalidateQueries({ queryKey: ['admin-picklists'] });
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = Array.isArray(err.response?.data?.message)
        ? err.response.data.message.join('; ')
        : err.response?.data?.message ?? err.message ?? '保存失败';
      setError(String(msg));
    }
  }

  const saving = saveField.isPending || savePicklistValues.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Pencil size={15} />
            </div>
            编辑字段
            {field.isSystem && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 uppercase tracking-wider">
                System
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* Read-only API + type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">API 名称（不可改）</Label>
              <div className="h-10 px-3 rounded-md bg-slate-50 border border-slate-200 flex items-center font-mono text-xs text-slate-500">
                {field.apiName}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">数据类型（不可改）</Label>
              <div className="h-10 px-3 rounded-md bg-slate-50 border border-slate-200 flex items-center text-sm font-bold text-slate-600">
                {TYPE_LABEL[field.type] ?? field.type}
              </div>
            </div>
          </div>

          {/* Editable label */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">字段展示标签 *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-10 border-slate-200"
            />
          </div>

          {/* Help text */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">帮助说明</Label>
            <Input
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="表单上字段下方的简短提示"
              className="h-9 border-slate-200 text-sm"
            />
          </div>

          {/* Required (custom fields only) */}
          {!field.isSystem && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-required"
                checked={required}
                onCheckedChange={(checked) => setRequired(!!checked)}
              />
              <Label htmlFor="edit-required" className="text-sm font-bold cursor-pointer">设为必填字段</Label>
            </div>
          )}

          {/* Picklist value editor */}
          {isPicklist && field.picklistId && (
            <div className="rounded-2xl bg-cyan-50/40 border border-cyan-100 p-5 space-y-3">
              <Label className="text-[10px] font-black uppercase text-cyan-600 tracking-wider">下拉选项</Label>
              <PicklistValuesEditor
                values={pkValues}
                onChange={setPkValues}
                showActiveToggle
                hint="修改后会同步影响所有引用此选项库的字段。停用（眼睛图标）可以让选项不再出现在新表单中，但已有数据保留。"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-xs font-bold">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl font-bold" onClick={onClose}>取消</Button>
            <Button
              type="button"
              className={cn(
                'rounded-xl font-bold text-white gap-1.5',
                'bg-indigo-600 hover:bg-indigo-700',
              )}
              onClick={handleSave}
              disabled={saving || !label.trim()}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              保存修改
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
