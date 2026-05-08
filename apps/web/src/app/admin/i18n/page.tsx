'use client';
// ─── /admin/i18n ──────────────────────────────────────────────────────────
// Per-tenant locale label override editor (Wave 19g/20g).
//
// Tabs: object / field / picklist / picklist_value
// Filters: locale picker (zh-CN / en-US / ja-JP / ...)
//
// The "+ 添加翻译" dialog provides a typeahead picker that loads the right
// entity list for the active tab from the metadata API.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, translationApi, type TranslationEntityType } from '@/lib/api';
import {
  Languages, Plus, Pencil, Trash2, Loader2, Save, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface Translation {
  id: string;
  entityType: TranslationEntityType;
  entityId: string;
  locale: string;
  label: string | null;
  description: string | null;
  helpText: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ObjectDef {
  id: string;
  apiName: string;
  label: string;
  labelPlural?: string;
}

interface FieldDef {
  id: string;
  apiName: string;
  label: string;
  picklistId?: string | null;
  picklist?: PicklistDef | null;
}

interface PicklistDef {
  id: string;
  apiName: string;
  label: string;
  values?: PicklistValueDef[];
}

interface PicklistValueDef {
  id: string;
  value: string;
  label: string;
}

const TABS: { value: TranslationEntityType; label: string }[] = [
  { value: 'object', label: '对象' },
  { value: 'field', label: '字段' },
  { value: 'picklist', label: '选项集' },
  { value: 'picklist_value', label: '选项值' },
];

const LOCALES = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'ko-KR', label: '한국어' },
];

interface FormState {
  entityType: TranslationEntityType;
  entityId: string;
  locale: string;
  label: string;
  description: string;
  helpText: string;
}

const emptyForm: FormState = {
  entityType: 'object',
  entityId: '',
  locale: 'en-US',
  label: '',
  description: '',
  helpText: '',
};

export default function I18nAdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TranslationEntityType>('object');
  const [locale, setLocale] = useState<string>('');
  const [editing, setEditing] = useState<Translation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading, error } = useQuery<Translation[]>({
    queryKey: ['translations', tab, locale],
    queryFn: () =>
      translationApi.list({
        entityType: tab,
        locale: locale || undefined,
      }),
  });

  const rows = Array.isArray(data) ? data : [];

  // ── Load metadata (objects / picklists) for label resolution and picker ─
  const { data: objectsResp } = useQuery<{ data?: ObjectDef[] } | ObjectDef[]>({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const objects: ObjectDef[] = useMemo(() => {
    if (Array.isArray(objectsResp)) return objectsResp;
    if (objectsResp && Array.isArray((objectsResp as { data?: ObjectDef[] }).data)) {
      return (objectsResp as { data: ObjectDef[] }).data;
    }
    return [];
  }, [objectsResp]);

  const { data: picklistsResp } = useQuery({
    queryKey: ['admin-picklists'],
    queryFn: () => adminApi.listPicklists(),
  });

  const picklists: PicklistDef[] = useMemo(() => {
    const r = picklistsResp as unknown;
    if (Array.isArray(r)) return r as PicklistDef[];
    if (r && typeof r === 'object' && Array.isArray((r as { data?: PicklistDef[] }).data)) {
      return (r as { data: PicklistDef[] }).data;
    }
    return [];
  }, [picklistsResp]);

  // For label resolution we keep flat maps from id → display.
  const objectById = useMemo(() => {
    const m = new Map<string, ObjectDef>();
    for (const o of objects) m.set(o.id, o);
    return m;
  }, [objects]);

  const picklistById = useMemo(() => {
    const m = new Map<string, PicklistDef>();
    for (const p of picklists) m.set(p.id, p);
    return m;
  }, [picklists]);

  const picklistValueById = useMemo(() => {
    const m = new Map<string, { value: PicklistValueDef; picklist: PicklistDef }>();
    for (const p of picklists) {
      for (const v of p.values ?? []) m.set(v.id, { value: v, picklist: p });
    }
    return m;
  }, [picklists]);

  // Lazy fields-per-object cache (loaded when picker switches to "field").
  const [fieldsByObject, setFieldsByObject] = useState<Record<string, FieldDef[]>>({});
  async function loadFields(apiName: string) {
    if (fieldsByObject[apiName]) return fieldsByObject[apiName];
    const obj = await adminApi.getObject(apiName);
    const fields: FieldDef[] = obj?.fields ?? [];
    setFieldsByObject((m) => ({ ...m, [apiName]: fields }));
    return fields;
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  const upsertMut = useMutation({
    mutationFn: (d: FormState) =>
      translationApi.upsert(d.entityType, d.entityId, d.locale, {
        label: d.label || undefined,
        description: d.description || undefined,
        helpText: d.helpText || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['translations'] });
      setCreating(false);
      setEditing(null);
      setForm(emptyForm);
      flash('ok', '翻译已保存');
    },
    onError: (e: unknown) => flash('err', (e as Error).message ?? '保存失败'),
  });

  const deleteMut = useMutation({
    mutationFn: ({ entityType, entityId, locale }: { entityType: TranslationEntityType; entityId: string; locale: string }) =>
      translationApi.remove(entityType, entityId, locale),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['translations'] });
      flash('ok', '翻译已删除');
    },
    onError: (e: unknown) => flash('err', (e as Error).message ?? '删除失败'),
  });

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }

  function startCreate() {
    setEditing(null);
    setForm({ ...emptyForm, entityType: tab, locale: locale || 'en-US' });
    setCreating(true);
  }

  function startEdit(r: Translation) {
    setCreating(false);
    setEditing(r);
    setForm({
      entityType: r.entityType,
      entityId: r.entityId,
      locale: r.locale,
      label: r.label ?? '',
      description: r.description ?? '',
      helpText: r.helpText ?? '',
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.entityId) { flash('err', '请选择实体'); return; }
    if (!form.locale) { flash('err', '请选择语言'); return; }
    upsertMut.mutate(form);
  }

  // ── Display helpers ──────────────────────────────────────────────────────
  function entityDisplay(t: Translation): { primary: string; secondary: string } {
    if (t.entityType === 'object') {
      const obj = objectById.get(t.entityId);
      return obj
        ? { primary: obj.label, secondary: obj.apiName }
        : { primary: '(未知对象)', secondary: t.entityId };
    }
    if (t.entityType === 'picklist') {
      const pl = picklistById.get(t.entityId);
      return pl
        ? { primary: pl.label, secondary: pl.apiName }
        : { primary: '(未知选项集)', secondary: t.entityId };
    }
    if (t.entityType === 'picklist_value') {
      const pv = picklistValueById.get(t.entityId);
      return pv
        ? { primary: `${pv.picklist.label} · ${pv.value.label}`, secondary: pv.value.value }
        : { primary: '(未知选项值)', secondary: t.entityId };
    }
    // For field translations we don't have a global lookup map (fields are
    // scoped per object); show the raw entityId.
    return { primary: '字段', secondary: t.entityId };
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500 flex items-center justify-center text-white">
              <Languages size={20} />
            </div>
            多语言翻译
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            为对象 / 字段 / 选项集 / 选项值添加除中文之外的语言标签
          </p>
        </div>
        <Button
          onClick={startCreate}
          className="h-11 rounded-xl font-bold gap-2 bg-brand hover:bg-brand-deep text-white"
        >
          <Plus size={14} />
          添加翻译
        </Button>
      </div>

      {/* Tabs + locale filter */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'px-4 h-9 rounded-lg text-xs font-bold transition-all',
                  tab === t.value
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-slate-500 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-slate-500">语言</Label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-ink bg-white"
            >
              <option value="">全部语言</option>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <Languages size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">暂无翻译</p>
              <p className="text-xs font-medium text-slate-400 mt-1">点击「添加翻译」开始录入</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">实体</th>
                  <th className="px-6 py-3 text-left">apiName / 值</th>
                  <th className="px-6 py-3 text-left">语言</th>
                  <th className="px-6 py-3 text-left">label（当前）</th>
                  <th className="px-6 py-3 text-left">description</th>
                  <th className="px-6 py-3 text-left">helpText</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const display = entityDisplay(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-black text-ink">{display.primary}</td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">{display.secondary}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border bg-violet-50 text-violet-700 border-violet-100">
                          {r.locale}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-ink truncate max-w-[200px]">
                        {r.label ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[200px]">
                        {r.description ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[200px]">
                        {r.helpText ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 rounded-lg gap-1 text-slate-500 hover:text-brand"
                            onClick={() => startEdit(r)}
                          >
                            <Pencil size={12} /> 编辑
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 rounded-lg gap-1 text-slate-500 hover:text-red-500 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`确认删除该翻译？`)) {
                                deleteMut.mutate({
                                  entityType: r.entityType,
                                  entityId: r.entityId,
                                  locale: r.locale,
                                });
                              }
                            }}
                          >
                            <Trash2 size={12} /> 删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) { setCreating(false); setEditing(null); }
        }}
      >
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑翻译' : '添加翻译'}</DialogTitle>
            <DialogDescription>
              覆写所选实体在指定语言下的 label / description / helpText。空字段将清除该字段的覆写。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">实体类型 *</Label>
                <select
                  value={form.entityType}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value as TranslationEntityType, entityId: '' }))}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-ink bg-white"
                >
                  {TABS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">语言 *</Label>
                <select
                  value={form.locale}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-ink bg-white"
                >
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">实体 *</Label>
              {editing ? (
                <Input
                  value={form.entityId}
                  disabled
                  className="h-10 rounded-xl font-mono text-xs"
                />
              ) : (
                <EntityPicker
                  entityType={form.entityType}
                  value={form.entityId}
                  onChange={(id) => setForm((f) => ({ ...f, entityId: id }))}
                  objects={objects}
                  picklists={picklists}
                  fieldsByObject={fieldsByObject}
                  loadFields={loadFields}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="本地化标签"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="（可选）本地化描述"
                className="rounded-xl min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">helpText</Label>
              <Textarea
                value={form.helpText}
                onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
                placeholder="（可选）本地化提示，仅字段类型显示"
                className="rounded-xl min-h-[60px]"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => { setCreating(false); setEditing(null); }}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={upsertMut.isPending}
                className="rounded-xl gap-1 bg-brand hover:bg-brand-deep text-white"
              >
                {upsertMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 max-w-md px-5 py-3 rounded-2xl shadow-2xl border text-sm font-bold',
          toast.kind === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-red-50 text-red-700 border-red-100',
        )}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Entity picker ─────────────────────────────────────────────────────────
// A typeahead picker that loads the right entity list for the active
// `entityType` and lets the user filter by label / apiName.
function EntityPicker({
  entityType,
  value,
  onChange,
  objects,
  picklists,
  fieldsByObject,
  loadFields,
}: {
  entityType: TranslationEntityType;
  value: string;
  onChange: (id: string) => void;
  objects: ObjectDef[];
  picklists: PicklistDef[];
  fieldsByObject: Record<string, FieldDef[]>;
  loadFields: (apiName: string) => Promise<FieldDef[]>;
}) {
  const [query, setQuery] = useState('');
  const [scopeObject, setScopeObject] = useState('');

  // Trigger field load when needed.
  useEffect(() => {
    if (entityType === 'field' && scopeObject && !fieldsByObject[scopeObject]) {
      loadFields(scopeObject);
    }
  }, [entityType, scopeObject, fieldsByObject, loadFields]);

  // Reset picker scope when entity type changes.
  useEffect(() => {
    setQuery('');
    setScopeObject('');
  }, [entityType]);

  const items: { id: string; primary: string; secondary: string }[] = useMemo(() => {
    if (entityType === 'object') {
      return objects.map((o) => ({ id: o.id, primary: o.label, secondary: o.apiName }));
    }
    if (entityType === 'picklist') {
      return picklists.map((p) => ({ id: p.id, primary: p.label, secondary: p.apiName }));
    }
    if (entityType === 'picklist_value') {
      const out: { id: string; primary: string; secondary: string }[] = [];
      for (const p of picklists) {
        for (const v of p.values ?? []) {
          out.push({
            id: v.id,
            primary: `${p.label} · ${v.label}`,
            secondary: `${p.apiName}.${v.value}`,
          });
        }
      }
      return out;
    }
    // field
    if (!scopeObject) return [];
    const fields = fieldsByObject[scopeObject] ?? [];
    return fields.map((f) => ({ id: f.id, primary: f.label, secondary: f.apiName }));
  }, [entityType, objects, picklists, scopeObject, fieldsByObject]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items.filter((it) =>
      it.primary.toLowerCase().includes(q) || it.secondary.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [items, query]);

  const selected = items.find((it) => it.id === value);

  return (
    <div className="space-y-2">
      {entityType === 'field' && (
        <select
          value={scopeObject}
          onChange={(e) => { setScopeObject(e.target.value); onChange(''); }}
          className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-ink bg-white"
        >
          <option value="">先选择对象…</option>
          {objects.map((o) => (
            <option key={o.apiName} value={o.apiName}>{o.label} ({o.apiName})</option>
          ))}
        </select>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`搜索 ${entityType === 'object' ? '对象' : entityType === 'field' ? '字段' : entityType === 'picklist' ? '选项集' : '选项值'}…`}
          className="h-10 pl-9 rounded-xl"
        />
      </div>
      <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl bg-white divide-y divide-slate-50">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 font-medium">无匹配</div>
        ) : (
          filtered.map((it) => (
            <button
              type="button"
              key={it.id}
              onClick={() => onChange(it.id)}
              className={cn(
                'w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between',
                value === it.id && 'bg-brand/5',
              )}
            >
              <div className="min-w-0">
                <div className={cn('text-xs font-bold truncate', value === it.id ? 'text-brand' : 'text-ink')}>
                  {it.primary}
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">{it.secondary}</div>
              </div>
              {value === it.id && <span className="text-[10px] font-black text-brand">已选</span>}
            </button>
          ))
        )}
      </div>
      {selected && (
        <p className="text-[11px] font-bold text-slate-500">
          已选: <span className="text-ink">{selected.primary}</span>
          <span className="ml-2 font-mono text-slate-400">{selected.secondary}</span>
        </p>
      )}
    </div>
  );
}
