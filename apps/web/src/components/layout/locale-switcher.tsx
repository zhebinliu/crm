'use client';
// ─── <LocaleSwitcher> ─────────────────────────────────────────────────────
// Floating dropdown anchored to the right of the topbar. Lets the user pick
// the *content* locale used for metadata labels returned by the API. The
// selection is persisted in localStorage under `tokenwave.locale` and is
// auto-attached to every API request via the `Accept-Language` header (see
// src/lib/api.ts). After switching, react-query is invalidated so that any
// loaded labels refresh immediately.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORTED_LOCALES, getLocale, setLocale, type LocaleValue } from '@/lib/locale';

export function LocaleSwitcher() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<LocaleValue>('zh-CN');
  const popRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    setCurrent(getLocale());
  }, []);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handlePick(v: LocaleValue) {
    setLocale(v);
    setCurrent(v);
    setOpen(false);
    // Refresh anything that depends on metadata labels.
    qc.invalidateQueries();
  }

  const active = SUPPORTED_LOCALES.find((l) => l.value === current) ?? SUPPORTED_LOCALES[0];

  return (
    <div ref={popRef} className="fixed top-4 right-[72px] z-30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 h-10 px-3 rounded-full shadow-md border bg-white',
          'hover:shadow-lg transition-all border-slate-200 text-slate-600',
        )}
        title="切换内容语言"
      >
        <Globe size={15} />
        <span className="text-xs font-bold">{active.short}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">内容语言</p>
          </div>
          <ul>
            {SUPPORTED_LOCALES.map((loc) => {
              const isActive = loc.value === current;
              return (
                <li key={loc.value}>
                  <button
                    type="button"
                    onClick={() => handlePick(loc.value)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors',
                      isActive ? 'text-brand font-bold' : 'text-ink font-medium',
                    )}
                  >
                    <span>{loc.label}</span>
                    {isActive && <Check size={14} className="text-brand" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
