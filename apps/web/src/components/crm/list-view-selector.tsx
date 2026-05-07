'use client';
// ─── <ListViewSelector> ───────────────────────────────────────────────────
// Per-user saved filter presets for any list page.
//
//   <ListViewSelector
//     objectApiName="Lead"
//     filters={filters}
//     onApply={(f) => setFilters(f)}
//   />
//
// Renders an inline pill row showing the user's views + tenant-shared views.
// Click a pill to apply its filters. Side menu lets the user save the
// current filters as a new view, set as default, share/unshare, delete.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listViewsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Bookmark, BookmarkCheck, Plus, MoreHorizontal, Star, Share2, Trash2,
  Loader2, Check, X, Globe2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sortBy: string | null;
  sortDir: 'asc' | 'desc' | null;
  isShared: boolean;
  isDefault: boolean;
  ownerId: string;
  owner?: { id: string; displayName: string } | null;
}

interface Props {
  objectApiName: string;
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
  /** Auto-apply user's default view on first mount. */
  applyDefaultOnMount?: boolean;
}

export function ListViewSelector({ objectApiName, filters, onApply, applyDefaultOnMount = true }: Props) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { data: views = [] } = useQuery<ListView[]>({
    queryKey: ['list-views', objectApiName],
    queryFn: () => listViewsApi.list(objectApiName),
    staleTime: 60_000,
  });

  // Apply user's default view once on mount, only if user hasn't manually
  // set filters yet (i.e. the filters object is empty).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    if (!applyDefaultOnMount || activeId || Object.keys(filters).length > 0) return;
    const def = views.find((v) => v.isDefault);
    if (def) {
      setActiveId(def.id);
      onApply(coerceFilters(def.filters));
    }
  }, [views.length]);

  function applyView(v: ListView) {
    setActiveId(v.id);
    onApply(coerceFilters(v.filters));
  }

  function clearView() {
    setActiveId(null);
    onApply({});
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={clearView}
          className={cn(
            'h-8 px-3 rounded-full text-xs font-black transition-colors flex items-center gap-1.5',
            !activeId ? 'bg-ink text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
          )}
        >
          全部
        </button>
        {views.map((v) => {
          const isActive = v.id === activeId;
          return (
            <div key={v.id} className="relative">
              <button
                type="button"
                onClick={() => applyView(v)}
                className={cn(
                  'h-8 pl-3 pr-2 rounded-full text-xs font-black transition-colors flex items-center gap-1.5',
                  isActive ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
                title={v.owner?.displayName ? `由 ${v.owner.displayName} 创建` : undefined}
              >
                {v.isDefault && <Star size={10} className={isActive ? 'text-white' : 'text-amber-500'} fill="currentColor" />}
                {v.isShared && <Globe2 size={10} className={isActive ? 'text-white' : 'text-emerald-500'} />}
                {v.name}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === v.id ? null : v.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setMenuFor(menuFor === v.id ? null : v.id); } }}
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center -mr-1',
                    isActive ? 'hover:bg-white/20' : 'hover:bg-slate-300/40',
                  )}
                >
                  <MoreHorizontal size={11} />
                </span>
              </button>
              {menuFor === v.id && (
                <ViewMenu
                  view={v}
                  onClose={() => setMenuFor(null)}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['list-views', objectApiName] })}
                />
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          disabled={Object.keys(filters).length === 0}
          className={cn(
            'h-8 px-3 rounded-full text-xs font-black transition-colors flex items-center gap-1',
            Object.keys(filters).length > 0
              ? 'bg-violet-50 text-violet-600 hover:bg-violet-100'
              : 'bg-slate-50 text-slate-300 cursor-not-allowed',
          )}
          title={Object.keys(filters).length === 0 ? '先设置过滤条件再保存' : '保存当前过滤为视图'}
        >
          <Bookmark size={11} />
          保存视图
        </button>
      </div>

      <SaveViewDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        objectApiName={objectApiName}
        filters={filters}
        onSaved={(view) => {
          qc.invalidateQueries({ queryKey: ['list-views', objectApiName] });
          setActiveId(view.id);
          setSaveOpen(false);
        }}
      />
    </>
  );
}

// ── Save dialog ──────────────────────────────────────────────────────────

function SaveViewDialog({
  open, onClose, objectApiName, filters, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  objectApiName: string;
  filters: Record<string, string>;
  onSaved: (view: ListView) => void;
}) {
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  const create = useMutation({
    mutationFn: () => listViewsApi.create({
      objectApiName,
      name: name.trim(),
      filters,
      isShared,
      isDefault,
    }) as Promise<ListView>,
    onSuccess: onSaved,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <BookmarkCheck size={15} />
            </div>
            保存视图
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              视图名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：本周热单 / 我的高优 deal"
              className="rounded-xl"
              autoFocus
            />
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 text-xs font-bold text-slate-500">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">当前过滤条件</div>
            {Object.keys(filters).length === 0
              ? <span className="text-slate-300 italic">无</span>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(filters).map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded-full bg-white text-slate-600 font-mono text-[11px]">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            <span className="text-sm font-bold text-ink">设为我的默认视图（每次进入此页面自动加载）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isShared} onCheckedChange={(v) => setIsShared(!!v)} />
            <span className="text-sm font-bold text-ink">共享给本租户所有人</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl font-bold" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              className="rounded-xl font-bold bg-brand hover:bg-brand-deep text-white gap-1.5"
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Per-view actions menu ────────────────────────────────────────────────

function ViewMenu({
  view, onClose, onChanged,
}: { view: ListView; onClose: () => void; onChanged: () => void }) {
  const update = useMutation({
    mutationFn: (data: Record<string, unknown>) => listViewsApi.update(view.id, data),
    onSuccess: () => { onChanged(); onClose(); },
  });
  const remove = useMutation({
    mutationFn: () => listViewsApi.remove(view.id),
    onSuccess: () => { onChanged(); onClose(); },
  });

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 top-9 left-0 w-52 rounded-2xl bg-white shadow-xl border border-slate-100 py-1.5 text-sm">
        <MenuItem
          icon={<Star size={13} className={view.isDefault ? 'text-amber-500' : 'text-slate-400'} fill={view.isDefault ? 'currentColor' : 'none'} />}
          label={view.isDefault ? '取消默认' : '设为默认'}
          onClick={() => update.mutate({ isDefault: !view.isDefault })}
        />
        <MenuItem
          icon={<Share2 size={13} className={view.isShared ? 'text-emerald-500' : 'text-slate-400'} />}
          label={view.isShared ? '取消共享' : '共享给租户'}
          onClick={() => update.mutate({ isShared: !view.isShared })}
        />
        <div className="my-1 border-t border-slate-100" />
        <MenuItem
          icon={<Trash2 size={13} className="text-red-500" />}
          label="删除视图"
          danger
          onClick={() => {
            if (confirm(`确定删除视图「${view.name}」吗？`)) remove.mutate();
          }}
        />
      </div>
    </>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'w-full px-3 py-2 flex items-center gap-2.5 text-left font-bold transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-slate-50',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Coerce server-side JSON values back into the string-record shape that the
// list pages expect (since the FilterBar uses Record<string, string>).
function coerceFilters(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val == null) continue;
    out[k] = String(val);
  }
  return out;
}
