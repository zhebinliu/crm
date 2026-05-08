'use client';
// Tiny debounce hook for autosaving permission detail panels.
import { useEffect, useRef, useState } from 'react';

export function useDebouncedSave<T>(
  value: T,
  save: (v: T) => Promise<unknown>,
  delayMs = 600,
): { status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; error: string | null } {
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await save(value);
        setStatus('saved');
        setError(null);
      } catch (e) {
        setStatus('error');
        setError((e as Error).message ?? '保存失败');
      }
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return { status, error };
}

export function SaveStatus({ status }: { status: 'idle' | 'pending' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  const map = {
    pending: { text: '待保存…', cls: 'text-slate-400' },
    saving:  { text: '保存中…', cls: 'text-blue-500' },
    saved:   { text: '已保存', cls: 'text-emerald-600' },
    error:   { text: '保存失败', cls: 'text-red-600' },
  } as const;
  const m = map[status];
  return <span className={`text-[11px] font-bold ${m.cls}`}>{m.text}</span>;
}
