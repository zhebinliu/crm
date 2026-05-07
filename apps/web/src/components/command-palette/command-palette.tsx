'use client';
// ─── <CommandPalette> ─────────────────────────────────────────────────────
// ⌘K opens a Spotlight-style modal that searches across opps / leads /
// accounts / contacts in parallel. Arrow keys + Enter to navigate. The
// last item is always "Ask 小销" — pressing Enter on it routes the query
// into the Copilot panel via a window event.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { oppsApi, leadsApi, accountsApi, contactsApi } from '@/lib/api';
import {
  Search, Target, UserPlus, Building2, Users, Sparkles, ArrowRight, X, ChevronUp, ChevronDown, CornerDownLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'opp' | 'lead' | 'account' | 'contact';
  title: string;
  subtitle: string;
  href: string;
}

interface RawListResponse {
  data: unknown[];
}

const ICONS = {
  opp: Target,
  lead: UserPlus,
  account: Building2,
  contact: Users,
};

const TYPE_LABEL = {
  opp: '商机',
  lead: '线索',
  account: '客户',
  contact: '联系人',
};

const TYPE_TINT = {
  opp: 'bg-indigo-50 text-indigo-600',
  lead: 'bg-violet-50 text-violet-600',
  account: 'bg-emerald-50 text-emerald-600',
  contact: 'bg-amber-50 text-amber-600',
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ⌘K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIdx(0);
      // Focus on next tick so the dialog has mounted.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debouncedQuery.length >= 1;

  const oppsQ = useQuery({
    queryKey: ['cp-opps', debouncedQuery],
    queryFn: () => oppsApi.list({ search: debouncedQuery, take: 6 }) as Promise<RawListResponse>,
    enabled,
    staleTime: 30_000,
  });
  const leadsQ = useQuery({
    queryKey: ['cp-leads', debouncedQuery],
    queryFn: () => leadsApi.list({ search: debouncedQuery, take: 6 }) as Promise<RawListResponse>,
    enabled,
    staleTime: 30_000,
  });
  const accountsQ = useQuery({
    queryKey: ['cp-accounts', debouncedQuery],
    queryFn: () => accountsApi.list({ search: debouncedQuery, take: 6 }) as Promise<RawListResponse>,
    enabled,
    staleTime: 30_000,
  });
  const contactsQ = useQuery({
    queryKey: ['cp-contacts', debouncedQuery],
    queryFn: () => contactsApi.list({ search: debouncedQuery, take: 6 }) as Promise<RawListResponse>,
    enabled,
    staleTime: 30_000,
  });

  // Flatten + group results
  const results = useMemo<SearchResult[]>(() => {
    if (!enabled) return [];
    const out: SearchResult[] = [];
    for (const o of (oppsQ.data?.data ?? []) as Array<{ id: string; name: string; stage?: string; account?: { name?: string } }>) {
      out.push({
        id: o.id, type: 'opp',
        title: o.name,
        subtitle: [o.account?.name, o.stage].filter(Boolean).join(' · '),
        href: `/opportunities/${o.id}`,
      });
    }
    for (const l of (leadsQ.data?.data ?? []) as Array<{ id: string; firstName?: string; lastName?: string; company?: string; status?: string }>) {
      const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company || '(无名)';
      out.push({
        id: l.id, type: 'lead', title: name,
        subtitle: [l.company, l.status].filter(Boolean).join(' · '),
        href: `/leads/${l.id}`,
      });
    }
    for (const a of (accountsQ.data?.data ?? []) as Array<{ id: string; name: string; industry?: string; type?: string }>) {
      out.push({
        id: a.id, type: 'account', title: a.name,
        subtitle: [a.industry, a.type].filter(Boolean).join(' · '),
        href: `/accounts/${a.id}`,
      });
    }
    for (const c of (contactsQ.data?.data ?? []) as Array<{ id: string; firstName?: string; lastName?: string; title?: string; account?: { name?: string } }>) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(无名)';
      out.push({
        id: c.id, type: 'contact', title: name,
        subtitle: [c.title, c.account?.name].filter(Boolean).join(' · '),
        href: `/contacts/${c.id}`,
      });
    }
    return out;
  }, [enabled, oppsQ.data, leadsQ.data, accountsQ.data, contactsQ.data]);

  const isLoading = enabled && (oppsQ.isLoading || leadsQ.isLoading || accountsQ.isLoading || contactsQ.isLoading);

  const totalRows = results.length + (enabled ? 1 : 0); // +1 for "Ask AI"
  // Clamp activeIdx
  useEffect(() => { if (activeIdx >= totalRows) setActiveIdx(Math.max(0, totalRows - 1)); }, [totalRows, activeIdx]);

  function handleNavigate(idx: number) {
    if (idx < results.length) {
      const r = results[idx];
      if (r) {
        router.push(r.href);
        setOpen(false);
      }
    } else if (enabled) {
      // Ask AI fallback
      window.dispatchEvent(new CustomEvent('tw:copilot-ask', { detail: { message: debouncedQuery } }));
      setOpen(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(totalRows - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleNavigate(activeIdx);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={() => setOpen(false)}
      />
      <div className="fixed left-1/2 top-[15vh] -translate-x-1/2 w-[min(640px,90vw)] z-50">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Search row */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <Search size={18} className="text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              onKeyDown={handleKey}
              placeholder="搜索商机、线索、客户、联系人，或输入问题"
              className="flex-1 bg-transparent outline-none text-base font-bold text-ink placeholder:text-slate-300"
            />
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-mono">esc</kbd>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-ink flex items-center justify-center sm:hidden"
            >
              <X size={15} />
            </button>
          </div>

          {/* Results */}
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            {!enabled && (
              <li className="px-6 py-12 text-center">
                <p className="text-sm font-bold text-slate-400">输入关键词开始搜索</p>
                <p className="text-[11px] font-medium text-slate-300 mt-2">
                  ↑↓ 切换 · <CornerDownLeft size={10} className="inline -mt-0.5" /> 选中 · ⌘K 关闭
                </p>
              </li>
            )}

            {enabled && isLoading && results.length === 0 && (
              <li className="px-6 py-12 text-center text-sm font-bold text-slate-400">搜索中…</li>
            )}

            {enabled && !isLoading && results.length === 0 && (
              <li className="px-6 py-8 text-center">
                <p className="text-sm font-bold text-slate-400">未找到匹配的记录</p>
                <p className="text-[11px] font-medium text-slate-300 mt-1">按回车询问 AI 助手</p>
              </li>
            )}

            {results.map((r, i) => {
              const Icon = ICONS[r.type];
              const tint = TYPE_TINT[r.type];
              const isActive = i === activeIdx;
              return (
                <li key={r.type + r.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(i)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors',
                      isActive ? 'bg-violet-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', tint)}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-black text-ink truncate">{r.title}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {TYPE_LABEL[r.type]}
                        </span>
                      </div>
                      {r.subtitle && (
                        <p className="text-xs text-slate-500 font-medium truncate">{r.subtitle}</p>
                      )}
                    </div>
                    {isActive && <ArrowRight size={13} className="text-violet-500 shrink-0" />}
                  </button>
                </li>
              );
            })}

            {/* Ask AI row */}
            {enabled && (() => {
              const i = results.length;
              const isActive = i === activeIdx;
              return (
                <li className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleNavigate(i)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors',
                      isActive
                        ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50'
                        : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0">
                      <Sparkles size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-ink">询问 AI 助手</div>
                      <div className="text-xs text-slate-500 font-medium truncate">
                        将「{debouncedQuery}」作为问题发给小销
                      </div>
                    </div>
                    {isActive && <ArrowRight size={13} className="text-violet-500 shrink-0" />}
                  </button>
                </li>
              );
            })()}
          </ul>

          {/* Footer */}
          <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><ChevronUp size={10} /><ChevronDown size={10} /> 切换</span>
              <span className="flex items-center gap-1"><CornerDownLeft size={10} /> 选中</span>
            </div>
            <span className="font-mono">⌘J 切换 AI 助手</span>
          </div>
        </div>
      </div>
    </>
  );
}
