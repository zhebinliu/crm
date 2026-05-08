'use client';
// ─── Shared editors for Profile / Permission Set detail pages (Wave 20d)
// • ObjectCrudMatrix    — checkboxes for read / write / create / delete per object
// • SystemPermsPanel    — multiselect-style chips with typeahead from a known set
// • FieldPermsPanel     — collapsible per-object table over `<obj>.<field>` keys

import { useMemo, useState } from 'react';
import { Plus, X, ChevronDown, ChevronRight, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CrudFlags, FieldFlags } from '@/lib/api';

// ── Hardcoded object catalog (matches LTC modules) ─────────────────────────
export const KNOWN_OBJECTS: Array<{ apiName: string; label: string }> = [
  { apiName: 'lead', label: '线索 Lead' },
  { apiName: 'account', label: '客户 Account' },
  { apiName: 'contact', label: '联系人 Contact' },
  { apiName: 'opportunity', label: '商机 Opportunity' },
  { apiName: 'quote', label: '报价 Quote' },
  { apiName: 'order', label: '订单 Order' },
  { apiName: 'contract', label: '合同 Contract' },
  { apiName: 'activity', label: '活动 Activity' },
  { apiName: 'case', label: '服务工单 Case' },
  { apiName: 'campaign', label: '营销活动 Campaign' },
  { apiName: 'knowledge', label: '知识 Knowledge' },
];

export const KNOWN_SYSTEM_PERMS: Array<{ code: string; label: string }> = [
  { code: 'api_enabled', label: 'API 调用' },
  { code: 'modify_all_data', label: '修改所有数据 (admin)' },
  { code: 'view_all_data', label: '查看所有数据' },
  { code: 'admin_console', label: '后台管理控制台' },
  { code: 'manage_users', label: '用户管理' },
  { code: 'manage_roles', label: '角色管理' },
  { code: 'manage_workflows', label: '工作流管理' },
  { code: 'manage_metadata', label: '元数据管理' },
  { code: 'export_reports', label: '报表导出' },
  { code: 'bulk_delete', label: '批量删除' },
  { code: 'recycle_bin_purge', label: '回收站强制清理' },
  { code: 'mass_email', label: '群发邮件' },
  { code: 'gdpr_erase', label: 'GDPR 数据擦除' },
];

const CRUD_KEYS: Array<{ key: keyof CrudFlags; label: string; tone: string }> = [
  { key: 'read',   label: '读 Read',     tone: 'text-blue-700' },
  { key: 'write',  label: '写 Write',    tone: 'text-amber-700' },
  { key: 'create', label: '新建 Create', tone: 'text-emerald-700' },
  { key: 'delete', label: '删除 Delete', tone: 'text-red-700' },
];

// ── Object CRUD matrix ─────────────────────────────────────────────────────

export function ObjectCrudMatrix({
  value,
  onChange,
  disabled = false,
}: {
  value: Record<string, CrudFlags>;
  onChange: (next: Record<string, CrudFlags>) => void;
  disabled?: boolean;
}) {
  function toggle(obj: string, key: keyof CrudFlags) {
    const cur = value[obj] ?? {};
    const next: Record<string, CrudFlags> = {
      ...value,
      [obj]: { ...cur, [key]: !cur[key] },
    };
    onChange(next);
  }
  function setRow(obj: string, all: boolean) {
    onChange({
      ...value,
      [obj]: { read: all, write: all, create: all, delete: all },
    });
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3 text-left">对象 Object</th>
            {CRUD_KEYS.map((c) => (
              <th key={c.key} className="px-3 py-3 text-center w-[110px]">{c.label}</th>
            ))}
            <th className="px-3 py-3 text-center w-[80px]">快捷</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {KNOWN_OBJECTS.map((obj) => {
            const flags = value[obj.apiName] ?? {};
            return (
              <tr key={obj.apiName} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="text-sm font-bold text-ink">{obj.label}</div>
                  <div className="text-[10px] font-mono text-slate-400">{obj.apiName}</div>
                </td>
                {CRUD_KEYS.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      className={cn(
                        'h-4 w-4 rounded border-slate-300 disabled:opacity-50',
                        c.tone,
                      )}
                      checked={!!flags[c.key]}
                      onChange={() => toggle(obj.apiName, c.key)}
                    />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center text-[11px] font-bold">
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-slate-400 hover:text-emerald-600 underline-offset-2 hover:underline mr-1"
                    onClick={() => setRow(obj.apiName, true)}
                  >全开</button>
                  <span className="text-slate-200">|</span>
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-slate-400 hover:text-red-600 underline-offset-2 hover:underline ml-1"
                    onClick={() => setRow(obj.apiName, false)}
                  >全关</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── System permissions panel (chips + typeahead) ───────────────────────────

export function SystemPermsPanel({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return KNOWN_SYSTEM_PERMS.filter(
      (p) =>
        !value.includes(p.code) &&
        (!q || p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [input, value]);

  function add(code: string) {
    const c = code.trim();
    if (!c || value.includes(c)) return;
    onChange([...value, c]);
    setInput('');
    setShowSuggest(false);
  }
  function remove(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {value.length === 0 && (
          <span className="text-xs text-slate-400 italic">未配置任何系统权限</span>
        )}
        {value.map((p) => {
          const known = KNOWN_SYSTEM_PERMS.find((k) => k.code === p);
          return (
            <span
              key={p}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-bold border',
                known
                  ? 'bg-violet-50 text-violet-700 border-violet-100'
                  : 'bg-slate-100 text-slate-700 border-slate-200',
              )}
              title={known?.label}
            >
              {p}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="hover:text-red-500"
                  aria-label="移除"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {!disabled && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Input
              value={input}
              placeholder="输入权限 code（如 api_enabled）或选择推荐项…"
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(input);
                }
              }}
              className="h-9 rounded-xl"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl gap-1 font-bold"
              onClick={() => add(input)}
              disabled={!input.trim()}
            >
              <Plus size={14} /> 添加
            </Button>
          </div>
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-2xl border border-slate-100 shadow-xl max-h-64 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(s.code)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <span className="font-mono text-xs text-slate-700">{s.code}</span>
                  <span className="text-[11px] font-bold text-slate-400">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Field perms panel (collapsible per-object) ─────────────────────────────

export function FieldPermsPanel({
  value,
  onChange,
  disabled = false,
}: {
  value: Record<string, FieldFlags>;
  onChange: (next: Record<string, FieldFlags>) => void;
  disabled?: boolean;
}) {
  // Group keys by object.
  const grouped = useMemo(() => {
    const out: Record<string, Array<{ key: string; field: string; flags: FieldFlags }>> = {};
    for (const [key, flags] of Object.entries(value)) {
      const [obj, ...rest] = key.split('.');
      if (!obj || rest.length === 0) continue;
      out[obj] = out[obj] ?? [];
      out[obj].push({ key, field: rest.join('.'), flags });
    }
    return out;
  }, [value]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pickerObj, setPickerObj] = useState('');
  const [pickerField, setPickerField] = useState('');

  function toggleFlag(key: string, flag: keyof FieldFlags) {
    const cur = value[key] ?? {};
    onChange({ ...value, [key]: { ...cur, [flag]: !cur[flag] } });
  }
  function removeKey(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }
  function addRow() {
    const obj = pickerObj.trim();
    const field = pickerField.trim();
    if (!obj || !field) return;
    const key = `${obj}.${field}`;
    if (value[key]) return;
    onChange({ ...value, [key]: { read: true, write: false } });
    setPickerField('');
  }

  const totalKeys = Object.keys(value).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        当前共 <span className="font-bold text-slate-600">{totalKeys}</span> 条字段权限。键格式为 <span className="font-mono">&lt;object&gt;.&lt;field&gt;</span>。
      </div>

      {/* Add row */}
      {!disabled && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-2xl bg-slate-50/60 border border-slate-100">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">对象</label>
            <select
              value={pickerObj}
              onChange={(e) => setPickerObj(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium"
            >
              <option value="">选择…</option>
              {KNOWN_OBJECTS.map((o) => (
                <option key={o.apiName} value={o.apiName}>{o.apiName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">字段 apiName</label>
            <Input
              value={pickerField}
              onChange={(e) => setPickerField(e.target.value)}
              placeholder="例如 amount / stage / owner_id"
              className="h-9 rounded-xl"
            />
          </div>
          <Button
            type="button"
            className="h-9 rounded-xl gap-1 font-bold bg-ink hover:bg-slate-800 text-white"
            onClick={addRow}
            disabled={!pickerObj || !pickerField.trim()}
          >
            <Plus size={14} /> 添加字段权限
          </Button>
        </div>
      )}

      {/* Per-object collapsible groups */}
      <div className="space-y-2">
        {Object.keys(grouped).length === 0 ? (
          <div className="px-4 py-6 text-center text-sm font-bold text-slate-400 bg-white rounded-2xl border border-slate-100">
            <ShieldQuestion size={18} className="inline-block text-slate-300 mr-1.5" />
            尚未配置任何字段级权限
          </div>
        ) : (
          Object.entries(grouped).map(([obj, rows]) => {
            const isOpen = open[obj] ?? true;
            return (
              <div key={obj} className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50/60 hover:bg-slate-100/60"
                  onClick={() => setOpen({ ...open, [obj]: !isOpen })}
                >
                  <span className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="font-mono text-xs font-bold text-slate-700">{obj}</span>
                    <span className="text-[10px] font-bold text-slate-400">({rows.length})</span>
                  </span>
                </button>
                {isOpen && (
                  <table className="w-full text-sm">
                    <thead className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-t border-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-left">字段</th>
                        <th className="px-3 py-2 text-center w-[100px]">读</th>
                        <th className="px-3 py-2 text-center w-[100px]">写</th>
                        <th className="px-3 py-2 text-center w-[60px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.key} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.field}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={!!r.flags.read}
                              onChange={() => toggleFlag(r.key, 'read')}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={!!r.flags.write}
                              onChange={() => toggleFlag(r.key, 'write')}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!disabled && (
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-500"
                                onClick={() => removeKey(r.key)}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
