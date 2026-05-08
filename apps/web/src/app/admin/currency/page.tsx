'use client';
// ─── /admin/currency ──────────────────────────────────────────────────────
// Currency rate admin (Wave 19g/20g). Lets the admin:
//   • see the corporate reporting currency badge (CNY fallback)
//   • filter the FX rate list by from / to currency
//   • create / edit / delete an effective rate row
//   • trigger the bulk recompute that refreshes convertedAmount across
//     every Opp / Quote / Order
//
// All writes go through `currencyApi` in `src/lib/api.ts`. The backend is
// the source of truth — this page only renders and submits.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currencyApi } from '@/lib/api';
import {
  Coins, Plus, RefreshCw, Trash2, Pencil, Loader2, Save, X, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CurrencyRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string; // Decimal serialized as string
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
}

const COMMON_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'GBP', 'SGD', 'KRW'];
const SOURCES = ['manual', 'ecb', 'boc'];
const CORPORATE_CURRENCY_FALLBACK = 'CNY';

interface FormState {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
}

const emptyForm: FormState = {
  fromCurrency: 'USD',
  toCurrency: 'CNY',
  rate: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  source: 'manual',
};

export default function CurrencyAdminPage() {
  const qc = useQueryClient();
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [editing, setEditing] = useState<CurrencyRate | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRecompute, setConfirmRecompute] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const queryKey = useMemo(
    () => ['currency-rates', filterFrom, filterTo],
    [filterFrom, filterTo],
  );

  const { data, isLoading, error } = useQuery<CurrencyRate[]>({
    queryKey,
    queryFn: () =>
      currencyApi.list({
        from: filterFrom || undefined,
        to: filterTo || undefined,
      }),
  });

  const rows = Array.isArray(data) ? data : [];

  const createMut = useMutation({
    mutationFn: (d: FormState) =>
      currencyApi.create({
        fromCurrency: d.fromCurrency.toUpperCase(),
        toCurrency: d.toCurrency.toUpperCase(),
        rate: parseFloat(d.rate),
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo || undefined,
        source: d.source,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      setCreating(false);
      setForm(emptyForm);
      flash('ok', '汇率已创建');
    },
    onError: (e: unknown) => flash('err', (e as Error).message ?? '创建失败'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: FormState }) =>
      currencyApi.update(id, {
        rate: parseFloat(d.rate),
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo || null,
        source: d.source,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      setEditing(null);
      setForm(emptyForm);
      flash('ok', '汇率已更新');
    },
    onError: (e: unknown) => flash('err', (e as Error).message ?? '更新失败'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => currencyApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      flash('ok', '汇率已删除');
    },
    onError: (e: unknown) => flash('err', (e as Error).message ?? '删除失败'),
  });

  const recomputeMut = useMutation({
    mutationFn: () => currencyApi.recompute(),
    onSuccess: (resp: { ok: boolean; total: number; counts: { opportunities: number; quotes: number; orders: number } }) => {
      setConfirmRecompute(false);
      const c = resp.counts ?? { opportunities: 0, quotes: 0, orders: 0 };
      flash('ok', `重新计算完成：共 ${resp.total} 条（机会 ${c.opportunities} / 报价 ${c.quotes} / 订单 ${c.orders}）`);
    },
    onError: (e: unknown) => {
      setConfirmRecompute(false);
      flash('err', (e as Error).message ?? '重新计算失败');
    },
  });

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCreating(true);
  }

  function startEdit(r: CurrencyRate) {
    setCreating(false);
    setEditing(r);
    setForm({
      fromCurrency: r.fromCurrency,
      toCurrency: r.toCurrency,
      rate: String(r.rate),
      effectiveFrom: r.effectiveFrom.slice(0, 10),
      effectiveTo: r.effectiveTo ? r.effectiveTo.slice(0, 10) : '',
      source: r.source ?? 'manual',
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.rate || isNaN(parseFloat(form.rate))) {
      flash('err', '请输入有效汇率');
      return;
    }
    if (editing) updateMut.mutate({ id: editing.id, d: form });
    else createMut.mutate(form);
  }

  const dialogOpen = creating || editing !== null;
  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white">
              <Coins size={20} />
            </div>
            货币与汇率
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm text-slate-500 font-medium">
              管理多币种汇率与公司报告币种的换算
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-[11px] font-bold">
              公司币种: {CORPORATE_CURRENCY_FALLBACK}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setConfirmRecompute(true)}
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            disabled={recomputeMut.isPending}
          >
            {recomputeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            重新计算
          </Button>
          <Button
            onClick={startCreate}
            className="h-11 rounded-xl font-bold gap-2 bg-brand hover:bg-brand-deep text-white"
          >
            <Plus size={14} />
            新建汇率
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5 flex items-end gap-3 flex-wrap">
          <Filter size={14} className="text-slate-400 mb-3" />
          <div className="space-y-1.5 w-40">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">来源币</Label>
            <CurrencyPicker value={filterFrom} onChange={setFilterFrom} placeholder="全部" />
          </div>
          <div className="space-y-1.5 w-40">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">目标币</Label>
            <CurrencyPicker value={filterTo} onChange={setFilterTo} placeholder="全部" />
          </div>
          {(filterFrom || filterTo) && (
            <Button
              variant="ghost"
              className="h-10 rounded-xl text-slate-500 font-bold gap-1"
              onClick={() => { setFilterFrom(''); setFilterTo(''); }}
            >
              <X size={12} /> 清空
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Rates table */}
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
              <Coins size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">暂无汇率配置</p>
              <p className="text-xs font-medium text-slate-400 mt-1">点击「+ 新建汇率」开始录入</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">来源币 → 目标币</th>
                  <th className="px-6 py-3 text-right">汇率</th>
                  <th className="px-6 py-3 text-left">生效起</th>
                  <th className="px-6 py-3 text-left">生效止</th>
                  <th className="px-6 py-3 text-left">来源</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-black text-ink">
                      <span className="font-mono">{r.fromCurrency}</span>
                      <span className="mx-2 text-slate-300">→</span>
                      <span className="font-mono">{r.toCurrency}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums text-ink">
                      {Number(r.rate).toLocaleString('zh-CN', { maximumFractionDigits: 8 })}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{r.effectiveFrom.slice(0, 10)}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {r.effectiveTo ? r.effectiveTo.slice(0, 10) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase border',
                        r.source === 'manual' ? 'bg-slate-50 text-slate-600 border-slate-200'
                        : r.source === 'ecb' ? 'bg-blue-50 text-blue-700 border-blue-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100',
                      )}>
                        {r.source}
                      </span>
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
                            if (confirm(`确认删除 ${r.fromCurrency}→${r.toCurrency} 的汇率？`)) {
                              deleteMut.mutate(r.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 size={12} /> 删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) { setCreating(false); setEditing(null); }
        }}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑汇率' : '新建汇率'}</DialogTitle>
            <DialogDescription>
              录入一条带生效区间的换算行。同一对货币可以有多条不同时段的汇率。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">来源币 *</Label>
                <CurrencyPicker
                  value={form.fromCurrency}
                  onChange={(v) => setForm((f) => ({ ...f, fromCurrency: v }))}
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">目标币 *</Label>
                <CurrencyPicker
                  value={form.toCurrency}
                  onChange={(v) => setForm((f) => ({ ...f, toCurrency: v }))}
                  disabled={!!editing}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">汇率 *</Label>
              <Input
                type="number"
                step="0.00000001"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="例如 7.1234"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">生效起 *</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">生效止</Label>
                <Input
                  type="date"
                  value={form.effectiveTo}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">来源</Label>
              <select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-ink bg-white"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
              <Button type="submit" disabled={isSaving} className="rounded-xl gap-1 bg-brand hover:bg-brand-deep text-white">
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {editing ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recompute confirmation */}
      <Dialog open={confirmRecompute} onOpenChange={setConfirmRecompute}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>确认重新计算？</DialogTitle>
            <DialogDescription>
              将根据当前汇率配置批量刷新机会 / 报价 / 订单的 convertedAmount。任务可能需要数秒。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmRecompute(false)}>
              取消
            </Button>
            <Button
              className="rounded-xl gap-1 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => recomputeMut.mutate()}
              disabled={recomputeMut.isPending}
            >
              {recomputeMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              开始
            </Button>
          </DialogFooter>
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

// ── Currency picker ────────────────────────────────────────────────────────
// Plain <select> with the common currency list + an optional "全部" entry.
function CurrencyPicker({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-ink bg-white',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {COMMON_CURRENCIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}
