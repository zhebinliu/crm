'use client';
// ─── <PicklistValuesEditor> ───────────────────────────────────────────────
// Inline editor for picklist values used by both the new-field form and the
// edit-field modal. Each row has:
//   • value (code, immutable identifier in DB)
//   • label (display text, editable)
//   • color picker (native + hex fallback)
//   • active toggle (soft-delete instead of removing)
//   • move up/down buttons (reorder via displayOrder)
//   • remove button (with confirmation; only allowed if no records use it)
//
// Consequence-aware:
//   - Changing `value` (the code) is allowed but warned about — existing
//     records keep their raw code, losing the friendly label.
//   - Setting active=false hides the option from new entries but keeps
//     existing records intact (preferred over hard delete).
//   - Hard remove is allowed but the parent form should warn the user.

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ChevronUp, ChevronDown, Plus, Trash2, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PicklistValueDraft {
  /** Set when loaded from server; absent for new rows. */
  id?: string;
  value: string;
  label: string;
  color: string;
  isActive: boolean;
}

interface Props {
  values: PicklistValueDraft[];
  onChange: (next: PicklistValueDraft[]) => void;
  /** Optional warning shown above the rows (e.g. "记录使用情况"). */
  hint?: string;
  /** Show the "active" toggle (true for edit mode; usually false for new fields). */
  showActiveToggle?: boolean;
}

export function PicklistValuesEditor({ values, onChange, hint, showActiveToggle = false }: Props) {
  function update(i: number, patch: Partial<PicklistValueDraft>) {
    const next = [...values];
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  function remove(i: number) {
    const v = values[i];
    if (!v) return;
    if (v.label.trim() || v.value.trim()) {
      const ok = confirm(
        `确定移除选项「${v.label || v.value}」？\n\n` +
        `如果已有记录使用了这个值，它们将保留原编码 (${v.value || '空'}) 但失去显示标签和颜色。\n` +
        `如果只是想暂停使用，建议改为「停用」而不是删除。`,
      );
      if (!ok) return;
    }
    const next = values.filter((_, j) => j !== i);
    onChange(next.length > 0 ? next : [{ value: '', label: '', color: '', isActive: true }]);
  }

  return (
    <div className="space-y-2">
      {hint && <p className="text-[11px] font-medium text-slate-500">{hint}</p>}

      <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
        <div className="col-span-1 text-center">顺序</div>
        <div className="col-span-3">编码 *</div>
        <div className="col-span-4">显示名 *</div>
        <div className="col-span-2">颜色</div>
        {showActiveToggle && <div className="col-span-1 text-center">状态</div>}
        <div className={cn(showActiveToggle ? 'col-span-1' : 'col-span-2', 'text-right pr-1')}>操作</div>
      </div>

      {values.map((v, i) => {
        const dimmed = !v.isActive;
        return (
          <div
            key={i}
            className={cn(
              'grid grid-cols-12 gap-2 items-center',
              dimmed && 'opacity-60',
            )}
          >
            {/* Reorder */}
            <div className="col-span-1 flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-slate-400 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                title="上移"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === values.length - 1}
                className="text-slate-400 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                title="下移"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {/* Code (value) */}
            <div className="col-span-3">
              <Input
                value={v.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="hot"
                className="h-9 text-sm font-mono border-orange-200/70"
              />
            </div>

            {/* Label */}
            <div className="col-span-4">
              <Input
                value={v.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="热客户"
                className="h-9 text-sm border-orange-200/70"
              />
            </div>

            {/* Color picker (native) + hex */}
            <div className="col-span-2 flex items-center gap-1.5">
              <input
                type="color"
                value={isValidHex(v.color) ? v.color : '#ffffff'}
                onChange={(e) => update(i, { color: e.target.value })}
                className="w-9 h-9 rounded-lg border border-orange-200/70 bg-white cursor-pointer p-0.5"
                title="选择颜色"
              />
              <Input
                value={v.color}
                onChange={(e) => update(i, { color: e.target.value })}
                placeholder="#ef4444"
                className="h-9 text-[11px] font-mono border-orange-200/70 px-2 min-w-0 flex-1"
              />
            </div>

            {/* Active toggle */}
            {showActiveToggle && (
              <div className="col-span-1 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => update(i, { isActive: !v.isActive })}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                    v.isActive
                      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
                  )}
                  title={v.isActive ? '点击停用（不影响已有数据）' : '点击启用'}
                >
                  {v.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            )}

            {/* Remove */}
            <div className={cn(showActiveToggle ? 'col-span-1' : 'col-span-2', 'flex items-center justify-end pr-1')}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-300 hover:text-red-500"
                onClick={() => remove(i)}
                title="移除选项"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl h-8 font-bold gap-1 border-orange-200 text-orange-600 hover:bg-orange-100 text-xs"
        onClick={() => onChange([...values, { value: '', label: '', color: '', isActive: true }])}
      >
        <Plus size={12} /> 添加选项
      </Button>
    </div>
  );
}

function isValidHex(s: string | undefined | null): boolean {
  return typeof s === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(s);
}
