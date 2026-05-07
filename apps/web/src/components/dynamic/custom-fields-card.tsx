'use client';
// ─── <CustomFieldsCard> ───────────────────────────────────────────────────
// Drops onto any standard-object detail page (Lead / Opportunity / Account /
// Contact) to surface custom fields the admin added via /admin/metadata.
//
// Read mode: renders a clean key-value grid following the layoutJson order.
// Edit mode: opens an inline form with full <DynamicField> support
// (PICKLIST, MULTI_PICKLIST, DECIMAL, FORMULA read-only, JSON, etc.) and
// posts a single { customFields: {...} } patch via the supplied saveFn.
//
// The card hides itself when the object has no custom fields, so it's safe
// to drop unconditionally on every standard detail page.

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueries } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { DynamicField, validateField, type FieldDef } from './dynamic-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Pencil, Sparkles, Loader2, X, Save, AlertCircle, ExternalLink } from 'lucide-react';
import { cn, fmtMoney, fmtDate } from '@/lib/utils';

interface PicklistEntry { value: string; label: string; color?: string | null }

interface ResolvedRecord { name: string; secondary?: string }

// Map standard object api names to their CRM detail page paths.
const OBJECT_HREF: Record<string, string> = {
  Account: '/accounts',
  Contact: '/contacts',
  Lead: '/leads',
  Opportunity: '/opportunities',
  Quote: '/quotes',
  Order: '/orders',
};

interface Props {
  /** API name of the standard object (e.g. "Lead", "Opportunity"). */
  objectApiName: string;
  /** Current customFields blob from the record. */
  customFields: Record<string, unknown> | null | undefined;
  /** Handler that PATCHes the record. Should return the updated record. */
  saveFn: (patch: { customFields: Record<string, unknown> }) => Promise<unknown>;
  /** Called after save succeeds so parent can re-fetch. */
  onSaved?: () => void;
  /** Make the card read-only even if user has write perms. */
  readOnly?: boolean;
}

export function CustomFieldsCard({
  objectApiName, customFields, saveFn, onSaved, readOnly,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch object metadata (fields + layoutJson) once.
  const { data: objMeta, isLoading } = useQuery({
    queryKey: ['admin-object', objectApiName],
    queryFn: () => adminApi.getObject(objectApiName),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch picklists once (so read-mode can show labels not codes).
  const { data: picklists } = useQuery({
    queryKey: ['admin-picklists'],
    queryFn: () => adminApi.listPicklists(),
    staleTime: 5 * 60 * 1000,
  });

  const obj = objMeta?.data ?? objMeta;
  const allFields: FieldDef[] = obj?.fields ?? [];
  const customDefs = useMemo(
    () => allFields.filter((f) => f.isCustom),
    [allFields],
  );

  // Sectioned layout from layoutJson — sections each have { title, columns: 1|2, fields: [apiName...] }.
  // We only render sections that contain at least one custom field; fall back to a single
  // "自定义字段" section with all custom fields in display-order if there's no layout.
  const sections = useMemo<LayoutSection[]>(() => {
    const layout = obj?.layoutJson;
    const customApiNames = new Set(customDefs.map((f) => f.apiName));
    const fieldByApiName = new Map(customDefs.map((f) => [f.apiName, f]));

    if (Array.isArray(layout) && layout.length > 0) {
      const out: LayoutSection[] = [];
      const placed = new Set<string>();
      for (const sec of layout as Array<{ title?: string; columns?: number; fields?: string[] }>) {
        const fields = (sec.fields ?? [])
          .filter((api) => customApiNames.has(api))
          .map((api) => fieldByApiName.get(api)!)
          .filter(Boolean);
        if (fields.length === 0) continue;
        for (const f of fields) placed.add(f.apiName);
        out.push({
          title: sec.title ?? '自定义字段',
          columns: sec.columns === 1 ? 1 : 2,
          fields,
        });
      }
      // Append unplaced custom fields under a fallback section so admins
      // never lose visibility of a field they just created but haven't
      // dropped into the layout yet.
      const orphans = customDefs.filter((f) => !placed.has(f.apiName));
      if (orphans.length > 0) {
        out.push({ title: '其他自定义字段', columns: 2, fields: orphans });
      }
      return out;
    }
    return customDefs.length > 0
      ? [{ title: '自定义字段', columns: 2, fields: customDefs }]
      : [];
  }, [obj?.layoutJson, customDefs]);

  // Resolve REFERENCE field display names. Group by referenceTo + collect IDs.
  const referenceQueries = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const f of customDefs) {
      if (f.type !== 'REFERENCE' || !f.referenceTo) continue;
      const id = (customFields ?? {})[f.apiName];
      if (typeof id === 'string' && id.length > 0) {
        if (!groups.has(f.referenceTo)) groups.set(f.referenceTo, new Set());
        groups.get(f.referenceTo)!.add(id);
      }
    }
    return Array.from(groups.entries()).map(([objectApiName, idSet]) => ({
      objectApiName,
      ids: Array.from(idSet),
    }));
  }, [customDefs, customFields]);

  const resolvedRefs = useQueries({
    queries: referenceQueries.map((g) => ({
      queryKey: ['resolve', g.objectApiName, g.ids.slice().sort().join(',')],
      queryFn: () => adminApi.resolveRecords(g.objectApiName, g.ids) as Promise<Record<string, ResolvedRecord>>,
      staleTime: 5 * 60 * 1000,
      enabled: g.ids.length > 0,
    })),
  });

  const refMap = useMemo(() => {
    const m = new Map<string, ResolvedRecord & { objectApiName: string }>();
    referenceQueries.forEach((g, i) => {
      const data = resolvedRefs[i]?.data;
      if (!data) return;
      for (const [id, rec] of Object.entries(data)) {
        m.set(`${g.objectApiName}:${id}`, { ...rec, objectApiName: g.objectApiName });
      }
    });
    return m;
  }, [referenceQueries, resolvedRefs]);

  // When entering edit mode, seed the draft from current values.
  useEffect(() => {
    if (editing) {
      setDraft({ ...(customFields ?? {}) });
      setErrors({});
      setSaveError(null);
    }
  }, [editing, customFields]);

  // Picklist label lookup map: picklistId -> { value -> {label, color} }
  const picklistMap = useMemo(() => {
    const map = new Map<string, Map<string, PicklistEntry>>();
    if (Array.isArray(picklists)) {
      for (const p of picklists as Array<{ id: string; values: PicklistEntry[] }>) {
        const inner = new Map<string, PicklistEntry>();
        for (const v of p.values ?? []) inner.set(v.value, v);
        map.set(p.id, inner);
      }
    }
    return map;
  }, [picklists]);

  if (isLoading) {
    return (
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 animate-pulse">
          <div className="h-5 w-32 bg-slate-100 rounded mb-3" />
          <div className="h-12 bg-slate-100 rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  if (customDefs.length === 0) return null;
  if (sections.length === 0) return null;

  async function handleSave() {
    // Run client-side validation across all custom fields.
    const errs: Record<string, string> = {};
    for (const f of customDefs) {
      if (f.type === 'FORMULA') continue; // computed
      const e = validateField(f, draft[f.apiName]);
      if (e) errs[f.apiName] = e;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Merge with any existing customFields not in our schema (preserves
      // values for fields that may have been deleted but data still present).
      const merged = { ...(customFields ?? {}), ...draft };
      await saveFn({ customFields: merged });
      setEditing(false);
      onSaved?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
        ?? (e as { message?: string }).message
        ?? '保存失败';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
      <CardHeader className="p-6 pb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
            <Sparkles size={15} className="text-violet-500" />
          </div>
          自定义字段
          <span className="text-[11px] font-bold text-slate-400 ml-1">{customDefs.length} 项</span>
        </CardTitle>
        {!readOnly && !editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-xl font-bold gap-1.5 px-3 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil size={11} /> 编辑
          </Button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl font-bold gap-1.5 px-3 text-xs"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X size={11} /> 取消
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-xl font-bold gap-1.5 px-3 text-xs bg-brand hover:bg-brand-deep text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存
            </Button>
          </div>
        )}
      </CardHeader>
      <Separator className="bg-slate-100" />
      <CardContent className="p-6">
        {saveError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-sm font-bold text-red-600 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {saveError}
          </div>
        )}

        {editing ? (
          <div className="space-y-6">
            {sections.map((sec, idx) => (
              <section key={idx}>
                {sections.length > 1 && (
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">{sec.title}</h3>
                )}
                <div className={cn(
                  'grid gap-4',
                  sec.columns === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2',
                )}>
                  {sec.fields.map((f) => (
                    <DynamicField
                      key={f.id}
                      field={f}
                      value={draft[f.apiName]}
                      onChange={(val) => setDraft((prev) => ({ ...prev, [f.apiName]: val }))}
                      errorOverride={errors[f.apiName]}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((sec, idx) => (
              <section key={idx}>
                {sections.length > 1 && (
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">{sec.title}</h3>
                )}
                <dl className={cn(
                  'grid gap-x-6 gap-y-3',
                  sec.columns === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2',
                )}>
                  {sec.fields.map((f) => {
                    const raw = (customFields ?? {})[f.apiName];
                    const display = formatFieldForDisplay(f, raw, picklistMap, refMap);
                    const fullSpan = f.type === 'TEXTAREA' || f.type === 'JSON' || sec.columns === 1;
                    return (
                      <div
                        key={f.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-2xl bg-slate-50/40 hover:bg-slate-50 transition-colors',
                          fullSpan && sec.columns === 2 ? 'md:col-span-2' : null,
                        )}
                      >
                        <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 min-w-[5rem] mt-0.5">{f.label}</dt>
                        <dd className="text-sm font-bold text-ink min-w-0 flex-1">
                          {display ?? <span className="text-slate-300 font-medium">未填写</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LayoutSection {
  title: string;
  columns: 1 | 2;
  fields: FieldDef[];
}

// ── Read-mode formatter ──────────────────────────────────────────────────
function formatFieldForDisplay(
  field: FieldDef,
  value: unknown,
  picklistMap: Map<string, Map<string, PicklistEntry>>,
  refMap: Map<string, ResolvedRecord & { objectApiName: string }>,
): React.ReactNode {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;

  switch (field.type) {
    case 'BOOLEAN':
      return value ? '是' : '否';
    case 'CURRENCY':
      return typeof value === 'number' ? fmtMoney(value) : String(value);
    case 'PERCENT':
      return `${value}%`;
    case 'DATE':
      return fmtDate(value as string, 'YYYY-MM-DD');
    case 'DATETIME':
      return fmtDate(value as string, 'YYYY-MM-DD HH:mm');
    case 'EMAIL':
      return <a href={`mailto:${value}`} className="text-brand hover:underline break-all">{String(value)}</a>;
    case 'PHONE':
      return <a href={`tel:${value}`} className="text-brand hover:underline">{String(value)}</a>;
    case 'URL':
      return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">{String(value)}</a>;
    case 'PICKLIST': {
      if (!field.picklistId) return String(value);
      const entry = picklistMap.get(field.picklistId)?.get(String(value));
      if (!entry) return String(value);
      return (
        <span className="inline-flex items-center gap-1.5">
          {entry.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />}
          {entry.label}
        </span>
      );
    }
    case 'MULTI_PICKLIST': {
      const arr = Array.isArray(value)
        ? value
        : typeof value === 'string' ? value.split(/[,;]\s*/) : [];
      const inner = field.picklistId ? picklistMap.get(field.picklistId) : null;
      return (
        <div className="flex flex-wrap gap-1.5">
          {arr.map((v: string, i: number) => {
            const entry = inner?.get(v);
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold"
              >
                {entry?.color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />}
                {entry?.label ?? v}
              </span>
            );
          })}
        </div>
      );
    }
    case 'REFERENCE': {
      const id = String(value);
      const ref = field.referenceTo ? refMap.get(`${field.referenceTo}:${id}`) : null;
      if (!ref) {
        return <span className="font-mono text-xs text-slate-500">{id}</span>;
      }
      const href = field.referenceTo && OBJECT_HREF[field.referenceTo]
        ? `${OBJECT_HREF[field.referenceTo]}/${id}`
        : null;
      const inner = (
        <span className="inline-flex items-center gap-1.5">
          <span>{ref.name}</span>
          {ref.secondary && <span className="text-[11px] font-medium text-slate-400">· {ref.secondary}</span>}
        </span>
      );
      return href
        ? <Link href={href} className="text-brand hover:underline inline-flex items-center gap-1">{inner}<ExternalLink size={10} /></Link>
        : inner;
    }
    case 'JSON':
      return <pre className="text-[11px] font-mono text-slate-600 bg-slate-100 rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
    case 'TEXTAREA':
      return <span className="whitespace-pre-wrap leading-relaxed">{String(value)}</span>;
    case 'FORMULA':
      return <span className="font-mono text-slate-500">{String(value)}</span>;
    default:
      return String(value);
  }
}
