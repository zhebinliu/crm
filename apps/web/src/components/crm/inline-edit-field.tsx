'use client';
// ─── <InlineEditField> ────────────────────────────────────────────────────
// Salesforce-style click-to-edit field. Renders the value as a normal
// element; on hover shows a pencil; on click swaps to an input. Saves
// on Enter or blur, cancels on Esc.
//
//   <InlineEditField
//     value={lead.title}
//     onSave={(v) => leadsApi.update(lead.id, { title: v })}
//     placeholder="未填写"
//   />
//
// Variants: text (default), textarea, number, date, select.
// Empty values render a muted "未填写" hint that's still clickable.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Value = string | number | null | undefined;

interface BaseProps {
  value: Value;
  onSave: (value: Value) => Promise<unknown>;
  /** Invalidate this query key on successful save so detail page refetches. */
  invalidateKeys?: string[];
  /** Placeholder shown in read mode when value is empty. */
  placeholder?: string;
  /** Disable inline edit entirely (display only). */
  readOnly?: boolean;
  /** Tailwind classes for the read-mode container. */
  className?: string;
  /** Renderer for read mode. Receives the value. Defaults to String(value). */
  renderRead?: (value: Value) => React.ReactNode;
}

interface TextProps extends BaseProps { kind?: 'text' | 'number' | 'date'; }
interface TextareaProps extends BaseProps { kind: 'textarea'; rows?: number }
interface SelectProps extends BaseProps { kind: 'select'; options: { value: string; label: string }[] }
type Props = TextProps | TextareaProps | SelectProps;

export function InlineEditField(props: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(stringify(props.value));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  const save = useMutation({
    mutationFn: (next: Value) => props.onSave(next),
    onSuccess: () => {
      props.invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setEditing(false);
    },
  });

  // Re-seed when value changes externally
  useEffect(() => {
    if (!editing) setDraft(stringify(props.value));
  }, [props.value, editing]);

  // Auto-focus on entering edit
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) (inputRef.current as HTMLInputElement).select();
    }
  }, [editing]);

  function commit() {
    const next = parseDraft(draft, props.kind);
    if (Object.is(next, props.value ?? null)) {
      setEditing(false);
      return;
    }
    save.mutate(next);
  }

  function cancel() {
    setDraft(stringify(props.value));
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (props.kind ?? 'text') !== 'textarea') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && props.kind === 'textarea') {
      e.preventDefault();
      commit();
    }
  }

  if (props.readOnly) {
    return (
      <span className={cn('text-sm font-bold text-ink', props.className)}>
        {props.renderRead ? props.renderRead(props.value) : displayOf(props)}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'group relative text-left text-sm font-bold transition-colors',
          'hover:bg-slate-50 rounded-lg -mx-1.5 px-1.5 py-0.5 border border-transparent hover:border-slate-200',
          'cursor-text',
          isEmpty(props.value) ? 'text-slate-300' : 'text-ink',
          props.className,
        )}
        title="点击编辑"
      >
        <span>{props.renderRead ? props.renderRead(props.value) : displayOf(props)}</span>
        <Pencil
          size={10}
          className="ml-1.5 inline-block opacity-0 group-hover:opacity-60 transition-opacity text-slate-400"
        />
      </button>
    );
  }

  // Edit mode
  return (
    <div className={cn('inline-flex items-start gap-1.5 -mx-0.5', props.className)}>
      {props.kind === 'textarea' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          rows={props.rows ?? 3}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-[240px] max-w-[420px]"
          disabled={save.isPending}
        />
      ) : props.kind === 'select' ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); /* commit on change for selects */ save.mutate(e.target.value); }}
          onKeyDown={handleKey}
          onBlur={() => { /* select commits on change */ }}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300"
          disabled={save.isPending}
        >
          <option value="">— 未设置 —</option>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={props.kind === 'number' ? 'number' : props.kind === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-[140px]"
          disabled={save.isPending}
        />
      )}
      {save.isPending ? (
        <Loader2 size={13} className="text-violet-500 animate-spin mt-1" />
      ) : (
        <>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); commit(); }} className="text-emerald-500 hover:text-emerald-600 mt-1" title="保存 (Enter)">
            <Check size={13} />
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); cancel(); }} className="text-slate-400 hover:text-red-500 mt-1" title="取消 (Esc)">
            <X size={13} />
          </button>
        </>
      )}
      {save.error && (
        <p className="text-[11px] font-bold text-red-500 mt-1 ml-1">
          {(save.error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
            ?? (save.error as { message?: string }).message ?? '保存失败'}
        </p>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function isEmpty(v: Value): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

function stringify(v: Value): string {
  if (isEmpty(v)) return '';
  if (typeof v === 'string') {
    // For dates, normalize ISO → YYYY-MM-DD for the date input.
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return v;
  }
  return String(v);
}

function parseDraft(s: string, kind: Props['kind']): Value {
  if (s === '' || s == null) return null;
  if (kind === 'number') {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (kind === 'date') {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return s;
}

function displayOf(props: Props): React.ReactNode {
  if (isEmpty(props.value)) return props.placeholder ?? '未填写';
  if (props.kind === 'select') {
    const opt = props.options.find((o) => o.value === props.value);
    return opt?.label ?? String(props.value);
  }
  if (props.kind === 'date' && typeof props.value === 'string') {
    return props.value.length >= 10 ? props.value.slice(0, 10) : props.value;
  }
  return String(props.value);
}
