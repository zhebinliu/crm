// ─── <DynamicField> ────────────────────────────────────────────────────────
// Renders one field from a FieldDef. Handles every Prisma FieldType:
//   STRING/TEXT, TEXTAREA (alias), NUMBER, DECIMAL, CURRENCY, PERCENT,
//   BOOLEAN, DATE, DATETIME, EMAIL, PHONE, URL, PICKLIST, MULTI_PICKLIST,
//   REFERENCE, FORMULA (read-only), JSON.
//
// Validation: format checks (email/phone/url/number/decimal) run on blur and
// surface inline. Required check is also evaluated locally.
//
// Picklists are fetched once per session via TanStack Query and cached.

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LookupSelect } from './lookup-select';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

export type FieldType =
  | 'STRING' | 'TEXT' | 'TEXTAREA'
  | 'NUMBER' | 'DECIMAL' | 'CURRENCY' | 'PERCENT'
  | 'BOOLEAN'
  | 'DATE' | 'DATETIME'
  | 'EMAIL' | 'PHONE' | 'URL'
  | 'PICKLIST' | 'MULTI_PICKLIST'
  | 'REFERENCE'
  | 'FORMULA' | 'JSON';

export interface FieldDef {
  id: string;
  apiName: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  isSystem?: boolean;
  isCustom?: boolean;
  picklistId?: string;
  referenceTo?: string;
  helpText?: string | null;
  formulaExpr?: string | null;
}

interface PicklistValue {
  id: string;
  value: string;
  label: string;
  isDefault?: boolean;
  color?: string | null;
  displayOrder?: number;
}

interface Picklist {
  id: string;
  apiName: string;
  label: string;
  values: PicklistValue[];
}

// ── Format validators ──────────────────────────────────────────────────────

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^[+\d][\d\s\-()]{4,20}$/;
const RE_URL   = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function validateField(field: FieldDef, value: unknown): string | null {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return field.required ? '必填项' : null;
  }
  switch (field.type) {
    case 'EMAIL':
      if (typeof value !== 'string' || !RE_EMAIL.test(value)) return '请填写合法的邮箱';
      break;
    case 'PHONE':
      if (typeof value !== 'string' || !RE_PHONE.test(value)) return '请填写合法的电话号码';
      break;
    case 'URL':
      if (typeof value !== 'string' || !RE_URL.test(value)) return '请填写以 http:// 或 https:// 开头的链接';
      break;
    case 'NUMBER':
      if (typeof value !== 'number' || !Number.isFinite(value)) return '请填写数字';
      break;
    case 'DECIMAL':
    case 'CURRENCY':
    case 'PERCENT':
      if (typeof value !== 'number' || !Number.isFinite(value)) return '请填写数字';
      if (field.type === 'PERCENT' && (value < 0 || value > 100)) return '请填写 0-100 之间的百分比';
      break;
    case 'JSON':
      if (typeof value !== 'string') return null;
      try { JSON.parse(value); } catch { return 'JSON 格式无效'; }
      break;
  }
  return null;
}

// ── Picklist data hook ─────────────────────────────────────────────────────

function usePicklists() {
  return useQuery<Picklist[]>({
    queryKey: ['admin-picklists'],
    queryFn: () => adminApi.listPicklists(),
    staleTime: 5 * 60 * 1000,
  });
}

// ── DynamicField ───────────────────────────────────────────────────────────

interface Props {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
  /** External error (e.g. from server-side save failure). */
  errorOverride?: string;
  /** Optional className wrapper. */
  className?: string;
}

export function DynamicField({ field, value, onChange, errorOverride, className }: Props) {
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // re-validate when value changes after first blur
  useEffect(() => {
    if (touched) setLocalError(validateField(field, value));
  }, [field, value, touched]);

  const error = errorOverride ?? localError;
  const labelEl = (
    <Label className="text-xs text-ink-secondary font-bold flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-red-500">*</span>}
    </Label>
  );

  const helpEl = field.helpText
    ? <p className="text-[10px] text-slate-400 font-medium">{field.helpText}</p>
    : null;

  const errorEl = error
    ? <p className="text-[11px] text-red-500 font-bold flex items-center gap-1"><X size={10} />{error}</p>
    : null;

  const wrap = (input: React.ReactNode, isFullWidth = false) => (
    <div className={cn('space-y-1.5', isFullWidth && 'col-span-2', className)}>
      {labelEl}
      {input}
      {errorEl}
      {!error && helpEl}
    </div>
  );

  switch (field.type) {
    case 'STRING':
    case 'TEXT':
      return wrap(
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn('h-9', error && 'border-red-300 focus-visible:ring-red-200')}
        />,
      );
    case 'EMAIL':
    case 'PHONE':
    case 'URL':
      return wrap(
        <Input
          type={field.type === 'EMAIL' ? 'email' : field.type === 'URL' ? 'url' : 'tel'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn('h-9', error && 'border-red-300 focus-visible:ring-red-200')}
          placeholder={field.type === 'EMAIL' ? 'name@example.com' : field.type === 'URL' ? 'https://example.com' : '+86 138 0000 0000'}
        />,
      );
    case 'NUMBER':
    case 'DECIMAL':
    case 'CURRENCY':
    case 'PERCENT':
      return wrap(
        <div className="relative">
          {field.type === 'CURRENCY' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">¥</span>
          )}
          <Input
            type="number"
            step={field.type === 'NUMBER' ? '1' : '0.01'}
            min={field.type === 'PERCENT' ? 0 : undefined}
            max={field.type === 'PERCENT' ? 100 : undefined}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={() => setTouched(true)}
            className={cn(
              'h-9 tabular-nums',
              field.type === 'CURRENCY' && 'pl-7',
              field.type === 'PERCENT' && 'pr-8',
              error && 'border-red-300 focus-visible:ring-red-200',
            )}
          />
          {field.type === 'PERCENT' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
          )}
        </div>,
      );
    case 'TEXTAREA':
      return wrap(
        <Textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn('min-h-[80px]', error && 'border-red-300 focus-visible:ring-red-200')}
        />,
        true,
      );
    case 'BOOLEAN':
      return (
        <div className={cn('flex items-center space-x-2 h-9 self-end pb-2', className)}>
          <Checkbox
            id={field.id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <Label
            htmlFor={field.id}
            className="text-xs font-bold leading-none text-ink-secondary"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
        </div>
      );
    case 'DATE':
    case 'DATETIME':
      return wrap(
        <Input
          type={field.type === 'DATE' ? 'date' : 'datetime-local'}
          value={
            value
              ? new Date(value).toISOString().slice(0, field.type === 'DATE' ? 10 : 16)
              : ''
          }
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { onChange(null); return; }
            const d = new Date(v);
            onChange(isNaN(d.getTime()) ? null : d.toISOString());
          }}
          onBlur={() => setTouched(true)}
          className={cn('h-9', error && 'border-red-300 focus-visible:ring-red-200')}
        />,
      );
    case 'PICKLIST':
      return wrap(<PicklistSelect field={field} value={value} onChange={onChange} multi={false} onBlur={() => setTouched(true)} hasError={!!error} />);
    case 'MULTI_PICKLIST':
      return wrap(<PicklistSelect field={field} value={value} onChange={onChange} multi={true} onBlur={() => setTouched(true)} hasError={!!error} />, true);
    case 'REFERENCE':
      return wrap(
        <LookupSelect
          objectApiName={field.referenceTo || 'Account'}
          label={field.label}
          value={value}
          onChange={onChange}
        />,
      );
    case 'FORMULA':
      return wrap(
        <div className="h-9 px-3 rounded-md bg-slate-50 border border-slate-200 flex items-center text-sm text-slate-500 font-mono">
          {value != null && value !== '' ? String(value) : <span className="text-slate-300 italic">公式字段（只读）</span>}
        </div>,
      );
    case 'JSON':
      return wrap(
        <Textarea
          value={typeof value === 'string' ? value : value != null ? JSON.stringify(value, null, 2) : ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder='{ "key": "value" }'
          className={cn('min-h-[100px] font-mono text-xs', error && 'border-red-300 focus-visible:ring-red-200')}
        />,
        true,
      );
    default:
      return null;
  }
}

// ── PicklistSelect (single + multi) ────────────────────────────────────────

function PicklistSelect({
  field, value, onChange, multi, onBlur, hasError,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  multi: boolean;
  onBlur: () => void;
  hasError: boolean;
}) {
  const { data: picklists, isLoading } = usePicklists();
  const picklist = useMemo(
    () => picklists?.find((p) => p.id === field.picklistId),
    [picklists, field.picklistId],
  );

  if (!field.picklistId) {
    return (
      <div className="text-xs text-amber-600 font-bold p-2 rounded-md bg-amber-50">
        ⚠ 字段未绑定下拉选项库（picklistId 未设置）
      </div>
    );
  }
  if (isLoading) return <div className="h-9 rounded-md bg-slate-50 animate-pulse" />;
  if (!picklist) {
    return (
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={`找不到 picklist (${field.picklistId})`}
        className="h-9"
      />
    );
  }

  if (!multi) {
    return (
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className={cn('h-9', hasError && 'border-red-300 focus-visible:ring-red-200')} onBlur={onBlur}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {picklist.values.map((v) => (
            <SelectItem key={v.id} value={v.value}>
              <span className="flex items-center gap-2">
                {v.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />}
                {v.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Multi-picklist: render checkbox grid; persist as comma-separated string
  // (matches the typical Salesforce serialization).
  const selectedSet = new Set<string>(
    Array.isArray(value)
      ? value
      : typeof value === 'string' && value
        ? value.split(/[,;]\s*/)
        : [],
  );

  function toggle(v: string) {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  }

  return (
    <div
      className={cn('rounded-md border bg-white p-2 grid grid-cols-2 gap-1.5 min-h-[40px]', hasError && 'border-red-300')}
      onBlur={onBlur}
    >
      {picklist.values.map((v) => {
        const checked = selectedSet.has(v.value);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => toggle(v.value)}
            className={cn(
              'flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-xs font-bold transition-colors',
              checked ? 'bg-brand/10 text-brand' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <span className={cn(
              'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
              checked ? 'bg-brand border-brand text-white' : 'border-slate-300',
            )}>
              {checked && <Check size={10} />}
            </span>
            {v.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />}
            <span className="truncate">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
