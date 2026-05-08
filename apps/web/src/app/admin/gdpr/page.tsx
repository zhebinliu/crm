'use client';
// ─── /admin/gdpr ─────────────────────────────────────────────────────────
// Data subject portal: search a Person, then export their data bundle or
// invoke right-to-be-forgotten erasure (irreversible PII redaction).

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { personApi, gdprApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  FileLock2, Search, Download, Loader2, AlertTriangle, CheckCircle2, ShieldOff, XCircle,
} from 'lucide-react';

interface Person {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  firstName: string | null;
  lastName: string | null;
  leadCount: number;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

const REQUIRED_PHRASE = '我确认';

export default function GdprPortalPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eraseTarget, setEraseTarget] = useState<Person | null>(null);
  const [eraseResult, setEraseResult] = useState<{ erasedCount: number; redactedFieldCounts: Record<string, number> } | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ data: Person[]; total: number }>({
    queryKey: ['gdpr-search', search],
    queryFn: () => personApi.list({ search, take: 50 }),
    enabled: search.length > 0,
  });

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  async function handleExport(p: Person) {
    setExportingId(p.id);
    setExportError(null);
    try {
      const bundle = await gdprApi.exportData(p.id);
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${p.id}-${fmtDate(new Date(), 'YYYY-MM-DD')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError((e as Error).message ?? '导出失败');
    } finally {
      setExportingId(null);
    }
  }

  const rows = data?.data ?? [];

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
            <FileLock2 size={20} />
          </div>
          GDPR 数据主体门户
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-2">
          按身份字段搜索数据主体（Person），导出其完整数据包或执行被遗忘权擦除
        </p>
      </div>

      {/* Search */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <form onSubmit={applySearch} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                邮箱 / 姓名 / Person ID
              </label>
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="liu@zheb.in / 张三 / 13800138000"
                className="h-10 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-10 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-1.5">
              <Search size={14} /> 搜索
            </Button>
          </form>
          {exportError && (
            <div className="mt-3 text-xs font-bold text-red-600">{exportError}</div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {!search ? (
            <div className="p-16 text-center">
              <Search size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">输入查询条件以查找数据主体</p>
            </div>
          ) : isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <XCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-base font-black text-slate-400">未匹配到 Person</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">姓名</th>
                  <th className="px-6 py-3 text-left">主邮箱</th>
                  <th className="px-6 py-3 text-left">主电话</th>
                  <th className="px-6 py-3 text-left">关联</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => {
                  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-black text-ink">{name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{p.id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-600">{p.primaryEmail ?? '—'}</td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-600">{p.primaryPhone ?? '—'}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">
                        线索 {p.leadCount} · 联系人 {p.contactCount}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl gap-1 font-bold"
                            onClick={() => handleExport(p)}
                            disabled={exportingId === p.id}
                          >
                            {exportingId === p.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Download size={12} />}
                            导出我的数据
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl gap-1 font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setEraseTarget(p)}
                          >
                            <ShieldOff size={12} /> 删除我的数据
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

      <EraseDialog
        target={eraseTarget}
        onClose={() => setEraseTarget(null)}
        onSuccess={(res) => {
          setEraseTarget(null);
          setEraseResult(res);
        }}
      />

      <EraseSuccessDialog
        result={eraseResult}
        onClose={() => setEraseResult(null)}
      />
    </div>
  );
}

// ─── Erase confirmation dialog ─────────────────────────────────────────────

function EraseDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: Person | null;
  onClose: () => void;
  onSuccess: (res: { erasedCount: number; redactedFieldCounts: Record<string, number> }) => void;
}) {
  const [confirmText, setConfirmText] = useState('');

  const eraseMut = useMutation({
    mutationFn: (id: string) => gdprApi.erase(id, 'GDPR_REQUEST'),
    onSuccess: (res) => {
      setConfirmText('');
      onSuccess(res);
    },
  });

  const open = !!target;
  const ok = confirmText.trim() === REQUIRED_PHRASE;

  if (!open || !target) return (
    <Dialog open={false} onOpenChange={() => {}}>
      <DialogContent />
    </Dialog>
  );

  const name = [target.firstName, target.lastName].filter(Boolean).join(' ') || '(无姓名)';

  return (
    <Dialog
      open={open}
      onOpenChange={(b) => { if (!b) { setConfirmText(''); eraseMut.reset(); onClose(); } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2 text-red-600">
            <AlertTriangle size={20} /> 不可恢复的删除操作
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <span className="block">
              此操作将所有 PII 字段标红 <code className="px-1 py-0.5 rounded bg-red-50 text-red-700 font-mono text-[11px]">[GDPR_REDACTED]</code> 且不可恢复。
            </span>
            <span className="block">
              数据主体：<span className="font-bold text-ink">{name}</span>
              （<span className="font-mono">{target.id}</span>）
            </span>
            <span className="block">
              请输入 <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">{REQUIRED_PHRASE}</code> 继续。
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={REQUIRED_PHRASE}
            className={cn(
              'h-10 rounded-xl font-bold',
              ok ? 'border-red-300 ring-red-200' : '',
            )}
            autoFocus
          />
          {eraseMut.isError && (
            <div className="text-xs font-bold text-red-600">
              擦除失败：{(eraseMut.error as Error)?.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2 font-bold"
            disabled={!ok || eraseMut.isPending}
            onClick={() => eraseMut.mutate(target.id)}
          >
            {eraseMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
            执行被遗忘权擦除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Erase success dialog ──────────────────────────────────────────────────

function EraseSuccessDialog({
  result,
  onClose,
}: {
  result: { erasedCount: number; redactedFieldCounts: Record<string, number> } | null;
  onClose: () => void;
}) {
  const open = !!result;
  if (!open || !result) {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent />
      </Dialog>
    );
  }
  const total = Object.values(result.redactedFieldCounts).reduce((a, b) => a + b, 0);
  return (
    <Dialog open={open} onOpenChange={(b) => !b && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2 text-emerald-600">
            <CheckCircle2 size={20} /> 擦除完成
          </DialogTitle>
          <DialogDescription className="pt-2">
            共擦除 <span className="font-black text-ink">{result.erasedCount}</span> 条记录，
            脱敏字段累计 <span className="font-black text-ink">{total}</span> 处。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left py-1.5">表 / 实体</th>
                <th className="text-right py-1.5">脱敏字段数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(result.redactedFieldCounts).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 font-mono text-slate-700">{k}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">{v}</td>
                </tr>
              ))}
              {Object.keys(result.redactedFieldCounts).length === 0 && (
                <tr><td colSpan={2} className="py-2 text-center text-slate-400">无字段脱敏</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button className="rounded-xl bg-ink hover:bg-slate-800 text-white" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
