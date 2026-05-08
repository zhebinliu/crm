'use client';
// ─── /admin/sharing/owd ─────────────────────────────────────────────────────
// Wave 19c/20c — Org-Wide Defaults admin. Per-object baseline visibility
// (Private / PublicRead / PublicReadWrite) plus the "grant by hierarchy" toggle.
// Objects with no row use the legacy default `public_read_write + grantHierarchy=true`.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, owdApi, type InternalSharing, type ResolvedOwd } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Globe, Loader2, RefreshCw, Save, CheckCircle2,
} from 'lucide-react';

interface ObjectDef {
  apiName: string;
  label: string;
  labelPlural?: string;
}

interface RowState {
  objectApiName: string;
  internalSharing: InternalSharing;
  grantHierarchy: boolean;
  isDefault: boolean;
  dirty: boolean;
  saving?: boolean;
  saved?: boolean;
}

const SHARING_OPTIONS: { value: InternalSharing; label: string }[] = [
  { value: 'private', label: 'Private (私有)' },
  { value: 'public_read', label: 'PublicRead (公开只读)' },
  { value: 'public_read_write', label: 'PublicReadWrite (公开读写)' },
];

export default function OwdAdminPage() {
  const qc = useQueryClient();

  const { data: objects, isLoading: objectsLoading } = useQuery<ObjectDef[]>({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const { data: owdRows, isLoading: owdLoading, refetch, isFetching } = useQuery<ResolvedOwd[]>({
    queryKey: ['owd-list'],
    queryFn: () => owdApi.list(),
  });

  // Merge: every object → row state. Configured rows override defaults.
  const initialRows = useMemo(() => {
    if (!objects) return [];
    const configured = new Map<string, ResolvedOwd>();
    for (const r of owdRows ?? []) configured.set(r.objectApiName, r);
    return objects
      .map<RowState>((o) => {
        const apiName = o.apiName;
        const cfg = configured.get(apiName) ?? configured.get(apiName.toLowerCase());
        if (cfg) {
          return {
            objectApiName: apiName,
            internalSharing: cfg.internalSharing,
            grantHierarchy: cfg.grantHierarchy,
            isDefault: false,
            dirty: false,
          };
        }
        return {
          objectApiName: apiName,
          internalSharing: 'public_read_write',
          grantHierarchy: true,
          isDefault: true,
          dirty: false,
        };
      });
  }, [objects, owdRows]);

  const [rows, setRows] = useState<RowState[]>([]);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  function update(idx: number, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, dirty: true, saved: false };
      return next;
    });
  }

  const saveOne = useMutation({
    mutationFn: async (row: RowState) =>
      owdApi.set(row.objectApiName, {
        internalSharing: row.internalSharing,
        grantHierarchy: row.grantHierarchy,
      }),
    onMutate: (row) => {
      setRows((prev) =>
        prev.map((r) =>
          r.objectApiName === row.objectApiName ? { ...r, saving: true } : r,
        ),
      );
    },
    onSuccess: (_data, row) => {
      setRows((prev) =>
        prev.map((r) =>
          r.objectApiName === row.objectApiName
            ? { ...r, saving: false, dirty: false, isDefault: false, saved: true }
            : r,
        ),
      );
      qc.invalidateQueries({ queryKey: ['owd-list'] });
    },
    onError: (_err, row) => {
      setRows((prev) =>
        prev.map((r) =>
          r.objectApiName === row.objectApiName ? { ...r, saving: false } : r,
        ),
      );
    },
  });

  async function saveAll() {
    const dirty = rows.filter((r) => r.dirty);
    for (const r of dirty) {
      // Sequential: keep API logs deterministic; volume is tiny.
      // eslint-disable-next-line no-await-in-loop
      await saveOne.mutateAsync(r);
    }
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const loading = objectsLoading || owdLoading;

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Globe size={20} />
            </div>
            组织共享设置 (OWD)
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            为每个对象设置内部共享基线，再叠加角色层级与显式 RecordShare 决定最终可见性。
            未配置的对象使用默认值：
            <span className="ml-1 inline-flex items-center px-1.5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black">
              默认: PublicReadWrite
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          <Button
            className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
            onClick={saveAll}
            disabled={dirtyCount === 0 || saveOne.isPending}
          >
            <Save size={14} />
            保存全部 {dirtyCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black">
                {dirtyCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <Globe size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">尚未定义任何对象</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">对象</th>
                  <th className="px-6 py-3 text-left w-[280px]">内部共享</th>
                  <th className="px-6 py-3 text-left w-[180px]">按层级授权</th>
                  <th className="px-6 py-3 text-left w-[120px]">状态</th>
                  <th className="px-6 py-3 text-right w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={r.objectApiName} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-ink">{r.objectApiName}</div>
                      {r.isDefault && (
                        <div className="text-[10px] font-black text-slate-400 mt-0.5 uppercase tracking-wider">
                          默认: PublicReadWrite
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Select
                        value={r.internalSharing}
                        onValueChange={(v) =>
                          update(idx, { internalSharing: v as InternalSharing })
                        }
                      >
                        <SelectTrigger className="h-9 rounded-xl text-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHARING_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-4">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          checked={r.grantHierarchy}
                          onChange={(e) => update(idx, { grantHierarchy: e.target.checked })}
                        />
                        <span className="text-sm font-medium text-slate-700">
                          {r.grantHierarchy ? '允许' : '不授予'}
                        </span>
                      </label>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold">
                      {r.dirty ? (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-amber-50 text-amber-700">
                          未保存
                        </span>
                      ) : r.saved ? (
                        <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-emerald-50 text-emerald-700">
                          <CheckCircle2 size={12} /> 已保存
                        </span>
                      ) : r.isDefault ? (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-slate-50 text-slate-500">
                          使用默认
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 h-5 rounded-full bg-blue-50 text-blue-700">
                          已配置
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant={r.dirty ? 'default' : 'outline'}
                        className="h-8 rounded-xl gap-1 font-bold"
                        disabled={!r.dirty || r.saving}
                        onClick={() => saveOne.mutate(r)}
                      >
                        {r.saving ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        保存
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
