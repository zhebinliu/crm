'use client';

import { useState } from 'react';
import { Search, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
  options?: { value: string; label: string }[];
}

interface FilterBarProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onReset: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INLINE_COUNT = 3; // search + 2 additional = 3 inline fields (search always shown)

// ── Component ─────────────────────────────────────────────────────────────────

export function FilterBar({ fields, values, onChange, onReset }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  // The first field should always be 'search' (text). Inline fields = first INLINE_COUNT.
  const searchField = fields.find((f) => f.key === 'search');
  const nonSearchFields = fields.filter((f) => f.key !== 'search');
  const inlineFields = nonSearchFields.slice(0, INLINE_COUNT - 1); // 2 beside search
  const moreFields = nonSearchFields.slice(INLINE_COUNT - 1);

  const activeMoreCount = moreFields.filter((f) => values[f.key]?.trim()).length;
  const hasAnyActive = Object.values(values).some((v) => v?.trim());

  function set(key: string, val: string) {
    onChange({ ...values, [key]: val });
  }

  function renderField(field: FilterField, inputClass?: string) {
    if (field.type === 'select' && field.options) {
      return (
        <Select
          key={field.key}
          value={values[field.key] ?? ''}
          onValueChange={(v) => set(field.key, v === '__all__' ? '' : v)}
        >
          <SelectTrigger className={inputClass ?? 'h-9 rounded-xl text-sm w-36'}>
            <SelectValue placeholder={field.label} />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="__all__" className="font-medium text-slate-400">
              全部{field.label}
            </SelectItem>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="font-medium">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === 'date') {
      return (
        <Input
          key={field.key}
          type="date"
          value={values[field.key] ?? ''}
          onChange={(e) => set(field.key, e.target.value)}
          className={inputClass ?? 'h-9 rounded-xl text-sm w-36'}
          title={field.label}
        />
      );
    }

    if (field.type === 'number') {
      return (
        <Input
          key={field.key}
          type="number"
          placeholder={field.label}
          value={values[field.key] ?? ''}
          onChange={(e) => set(field.key, e.target.value)}
          className={inputClass ?? 'h-9 rounded-xl text-sm w-36'}
        />
      );
    }

    // Default: text
    return (
      <Input
        key={field.key}
        placeholder={field.label}
        value={values[field.key] ?? ''}
        onChange={(e) => set(field.key, e.target.value)}
        className={inputClass ?? 'h-9 rounded-xl text-sm w-36'}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
      {/* Search input — always visible */}
      {searchField && (
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <Input
            placeholder={searchField.label === '搜索' ? '搜索...' : searchField.label}
            value={values[searchField.key] ?? ''}
            onChange={(e) => set(searchField.key, e.target.value)}
            className="h-9 rounded-xl text-sm pl-8 w-48"
          />
        </div>
      )}

      {/* Inline additional fields */}
      {inlineFields.map((f) => renderField(f))}

      {/* 更多筛选 toggle */}
      {moreFields.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="h-9 rounded-xl text-sm font-medium border-slate-200 gap-1.5 relative"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          更多筛选
          {activeMoreCount > 0 && (
            <Badge className="ml-0.5 h-4 min-w-[16px] px-1 text-[10px] font-bold bg-brand text-white rounded-full leading-none flex items-center justify-center">
              {activeMoreCount}
            </Badge>
          )}
        </Button>
      )}

      {/* Reset button — only when filters active */}
      {hasAnyActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-9 rounded-xl text-sm font-medium text-slate-400 hover:text-ink gap-1.5"
        >
          <RotateCcw size={13} />
          重置筛选
        </Button>
      )}

      {/* Expanded "more" panel — full width row below */}
      {expanded && moreFields.length > 0 && (
        <div className="w-full flex flex-wrap items-center gap-3 pt-1 border-t border-slate-50 mt-1">
          {moreFields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                {f.label}
              </span>
              {renderField(f)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
