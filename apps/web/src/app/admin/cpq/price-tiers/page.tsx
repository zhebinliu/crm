'use client';
// ─── /admin/cpq/price-tiers ──────────────────────────────────────────────
// 阶梯定价 (Wave 20e) — 按产品分组列出 PriceTier，支持新增 / 编辑 / 删除。
// 同时提供一个 “价格预览” 工具，调用 POST /api/cpq/price-line 验证当前
// 阶梯规则在不同数量下的实际成交单价。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cpqApi, productsApi } from '@/lib/api';
import { cn, fmtMoney } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
} from '@/components/ui/select';
import {
  Layers, Loader2, Plus, RefreshCw, Search, Trash2, AlertCircle,
  ChevronDown, ChevronRight, Pencil, Calculator, Sparkles, CheckCircle2,
} from 'lucide-react';

interface Tier {
  id: string;
  productId: string;
  priceBookId?: string | null;
  minQuantity: number | string;
  unitPrice: number | string | null;
  discountPercent: number | string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ProductRow {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  defaultPrice?: number | string;
}

export default function PriceTiersPage() {
  const [productFilter, setProductFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTier, setEditTier] = useState<Tier | null>(null);
  const [previewProductId, setPreviewProductId] = useState<string>('');

  const { data, isLoading, isFetching, refetch, error } = useQuery<Tier[]>({
    queryKey: ['cpq-tiers', productFilter],
    queryFn: () => cpqApi.listTiers(productFilter || undefined),
    retry: 0,
  });

  const { data: productsData } = useQuery<{ data: ProductRow[] } | ProductRow[]>({
    queryKey: ['products-lookup-all'],
    queryFn: () => productsApi.list({ take: 100 }),
  });
  const products: ProductRow[] = useMemo(() => {
    const raw: any = productsData ?? [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [productsData]);
  const productById = useMemo(() => {
    const m = new Map<string, ProductRow>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  // Group tiers by productId
  const grouped = useMemo(() => {
    const list = data ?? [];
    const filtered = list.filter((t) => {
      if (!search.trim()) return true;
      const p = productById.get(t.productId);
      const q = search.trim().toLowerCase();
      return (
        p?.name?.toLowerCase().includes(q) ||
        p?.code?.toLowerCase().includes(q) ||
        t.productId.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, Tier[]>();
    filtered.forEach((t) => {
      if (!map.has(t.productId)) map.set(t.productId, []);
      map.get(t.productId)!.push(t);
    });
    // Sort tiers within each group by minQuantity asc
    map.forEach((tiers) =>
      tiers.sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity)),
    );
    return Array.from(map.entries());
  }, [data, search, productById]);

  // 后端 admin/price-tiers 接口可能尚未上线 — 优雅降级
  const backendUnavailable =
    error && /404|not\s*found|Cannot\s+(GET|POST)/i.test((error as Error).message);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Layers size={20} />
            </div>
            阶梯定价 / Price Tiers
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            按产品 + 数量阈值动态计算单价；与 PriceBook 共同决定行的成交价
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
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} /> 添加阶梯
          </Button>
        </div>
      </div>

      {/* Backend-not-ready notice */}
      {backendUnavailable && (
        <Card className="border border-amber-200 shadow-sm rounded-3xl bg-amber-50">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-black text-amber-900">阶梯定价管理接口暂未可用</p>
              <p className="text-xs font-medium text-amber-800">
                后端 <code className="font-mono px-1 bg-amber-100 rounded">/admin/price-tiers</code> CRUD 路由尚未上线。
                你仍然可以使用下方 “价格预览” 工具直接调用
                <code className="font-mono px-1 mx-1 bg-amber-100 rounded">POST /cpq/price-line</code>
                来验证已有阶梯规则的成交价。新增 / 编辑 / 删除阶梯请暂时通过后台 SQL 操作 PriceTier 表。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter row */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">按产品过滤</Label>
            <SelectPrimitive value={productFilter || 'all'} onValueChange={(v) => setProductFilter(v === 'all' ? '' : v)}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive placeholder="全部产品" />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive className="max-h-72">
                <SelectItemPrimitive value="all">全部产品</SelectItemPrimitive>
                {products.map((p) => (
                  <SelectItemPrimitive key={p.id} value={p.id}>
                    {p.name}{p.code ? ` (${p.code})` : ''}
                  </SelectItemPrimitive>
                ))}
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">搜索</Label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="按产品名 / 编号 / Tier ID"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price preview tool — 始终可用 */}
      <PricePreviewCard
        products={products}
        previewProductId={previewProductId}
        setPreviewProductId={setPreviewProductId}
      />

      {/* Grouped tiers */}
      {!backendUnavailable && (
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="p-16 text-center">
                <Layers size={32} className="mx-auto text-slate-200 mb-3" />
                <p className="text-base font-black text-slate-400">
                  {search || productFilter ? '没有匹配的阶梯规则' : '尚未配置阶梯，点击右上角“添加阶梯”'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {grouped.map(([productId, tiers]) => (
                  <ProductTierGroup
                    key={productId}
                    productId={productId}
                    product={productById.get(productId)}
                    tiers={tiers}
                    onEdit={setEditTier}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        products={products}
        defaultProductId={productFilter || undefined}
      />
      <TierFormDialog
        open={!!editTier}
        onOpenChange={(b) => !b && setEditTier(null)}
        products={products}
        editTier={editTier}
      />
    </div>
  );
}

// ─── Per-product expandable group ─────────────────────────────────────────

function ProductTierGroup({
  productId, product, tiers, onEdit,
}: {
  productId: string;
  product?: ProductRow;
  tiers: Tier[];
  onEdit: (t: Tier) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);

  const removeMut = useMutation({
    mutationFn: (tierId: string) => cpqApi.deleteTier(tierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cpq-tiers'] }),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <span className="text-sm font-black text-ink">{product?.name ?? productId}</span>
          {product?.code && (
            <span className="text-[10px] font-mono text-slate-400 px-1.5 h-4 rounded bg-slate-100 inline-flex items-center">
              {product.code}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-slate-500 tabular-nums">{tiers.length} 阶梯</span>
      </button>
      {open && (
        <table className="w-full">
          <thead className="bg-slate-50/40 text-[10px] font-black text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-2.5 text-left">最小数量</th>
              <th className="px-6 py-2.5 text-right">单价</th>
              <th className="px-6 py-2.5 text-right">折扣%</th>
              <th className="px-6 py-2.5 text-left">价格簿</th>
              <th className="px-6 py-2.5 text-center">启用</th>
              <th className="px-6 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tiers.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/40">
                <td className="px-6 py-3 text-sm font-bold tabular-nums">≥ {Number(t.minQuantity)}</td>
                <td className="px-6 py-3 text-sm text-right tabular-nums">
                  {t.unitPrice == null ? '—' : fmtMoney(Number(t.unitPrice))}
                </td>
                <td className="px-6 py-3 text-sm text-right tabular-nums">
                  {t.discountPercent == null ? '—' : `${Number(t.discountPercent)}%`}
                </td>
                <td className="px-6 py-3 text-xs font-mono text-slate-400">
                  {t.priceBookId ?? <span className="text-slate-300">全部</span>}
                </td>
                <td className="px-6 py-3 text-center">
                  {t.isActive ? (
                    <span className="text-emerald-700 text-[11px] font-bold">启用</span>
                  ) : (
                    <span className="text-slate-300 text-[11px] font-bold">停用</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl p-0"
                      onClick={() => onEdit(t)}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl p-0 text-red-400 hover:bg-red-50 hover:text-red-500"
                      onClick={() => {
                        if (confirm(`删除该阶梯？`)) removeMut.mutate(t.id);
                      }}
                      disabled={removeMut.isPending}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Price preview (POST /cpq/price-line) ─────────────────────────────────

function PricePreviewCard({
  products, previewProductId, setPreviewProductId,
}: {
  products: ProductRow[];
  previewProductId: string;
  setPreviewProductId: (s: string) => void;
}) {
  const [quantity, setQuantity] = useState<number>(1);
  const [priceBookId, setPriceBookId] = useState<string>('');

  const previewMut = useMutation<{
    unitPrice: number | string;
    listPrice: number | string;
    discount: number | string;
    discountSource: 'tier' | 'rule' | 'manual' | 'none';
    appliedTierId?: string;
  }>({
    mutationFn: () =>
      cpqApi.priceLine({
        productId: previewProductId,
        quantity,
        priceBookId: priceBookId || undefined,
      }),
  });

  return (
    <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-gradient-to-br from-slate-50 to-white">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-slate-700" />
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">价格预览</h2>
          <span className="text-[11px] font-medium text-slate-400">
            实时调用 POST /cpq/price-line 验证当前阶梯效果
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">产品</Label>
            <SelectPrimitive value={previewProductId} onValueChange={setPreviewProductId}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive placeholder="选择产品…" />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive className="max-h-72">
                {products.map((p) => (
                  <SelectItemPrimitive key={p.id} value={p.id}>
                    {p.name}{p.code ? ` (${p.code})` : ''}
                  </SelectItemPrimitive>
                ))}
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">数量</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">价格簿（可选）</Label>
            <Input
              value={priceBookId}
              onChange={(e) => setPriceBookId(e.target.value)}
              placeholder="留空使用标准价格簿"
              className="h-10 rounded-xl"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            className="h-10 rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            disabled={!previewProductId || previewMut.isPending}
            onClick={() => previewMut.mutate()}
          >
            {previewMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            预览成交价
          </Button>
          {previewMut.data && (
            <div className="flex items-center gap-3 flex-wrap text-xs font-bold">
              <Pill label="单价" value={fmtMoney(Number(previewMut.data.unitPrice))} accent="bg-emerald-50 text-emerald-700" />
              <Pill label="标价" value={fmtMoney(Number(previewMut.data.listPrice))} accent="bg-slate-100 text-slate-600" />
              <Pill label="折扣" value={`${Number(previewMut.data.discount).toFixed(2)}%`} accent="bg-amber-50 text-amber-700" />
              <Pill
                label="来源"
                value={DISCOUNT_SOURCE_ZH[previewMut.data.discountSource] ?? previewMut.data.discountSource}
                accent={DISCOUNT_SOURCE_COLOR[previewMut.data.discountSource] ?? 'bg-slate-100 text-slate-600'}
              />
            </div>
          )}
          {previewMut.isError && (
            <div className="text-xs font-bold text-red-600">
              预览失败：{(previewMut.error as Error)?.message}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const DISCOUNT_SOURCE_ZH: Record<string, string> = {
  tier: '阶梯',
  rule: '规则',
  manual: '手工',
  none: '无',
};
const DISCOUNT_SOURCE_COLOR: Record<string, string> = {
  tier: 'bg-cyan-50 text-cyan-700',
  rule: 'bg-violet-50 text-violet-700',
  manual: 'bg-amber-50 text-amber-700',
  none: 'bg-slate-100 text-slate-500',
};

function Pill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full', accent)}>
      <span className="opacity-70 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-black tabular-nums">{value}</span>
    </span>
  );
}

// ─── Tier form (create / edit) ────────────────────────────────────────────

function TierFormDialog({
  open, onOpenChange, products, editTier, defaultProductId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  products: ProductRow[];
  editTier?: Tier | null;
  defaultProductId?: string;
}) {
  const qc = useQueryClient();
  const isEdit = !!editTier;

  const [productId, setProductId] = useState<string>(editTier?.productId ?? defaultProductId ?? '');
  const [minQuantity, setMinQuantity] = useState<number>(editTier ? Number(editTier.minQuantity) : 1);
  const [mode, setMode] = useState<'unitPrice' | 'discount'>(
    editTier?.unitPrice != null ? 'unitPrice' : 'discount',
  );
  const [unitPrice, setUnitPrice] = useState<string>(
    editTier?.unitPrice != null ? String(Number(editTier.unitPrice)) : '',
  );
  const [discountPercent, setDiscountPercent] = useState<string>(
    editTier?.discountPercent != null ? String(Number(editTier.discountPercent)) : '',
  );
  const [priceBookId, setPriceBookId] = useState<string>(editTier?.priceBookId ?? '');
  const [isActive, setIsActive] = useState<boolean>(editTier ? editTier.isActive : true);
  const [error, setError] = useState('');

  // Sync state when modal re-opens for a different row
  useMemo(() => {
    if (open) {
      setProductId(editTier?.productId ?? defaultProductId ?? '');
      setMinQuantity(editTier ? Number(editTier.minQuantity) : 1);
      setMode(editTier?.unitPrice != null ? 'unitPrice' : 'discount');
      setUnitPrice(editTier?.unitPrice != null ? String(Number(editTier.unitPrice)) : '');
      setDiscountPercent(editTier?.discountPercent != null ? String(Number(editTier.discountPercent)) : '');
      setPriceBookId(editTier?.priceBookId ?? '');
      setIsActive(editTier ? editTier.isActive : true);
      setError('');
    }
  }, [open, editTier, defaultProductId]);

  const createMut = useMutation({
    mutationFn: () =>
      cpqApi.createTier({
        productId,
        minQuantity,
        unitPrice: mode === 'unitPrice' && unitPrice !== '' ? Number(unitPrice) : undefined,
        discountPercent: mode === 'discount' && discountPercent !== '' ? Number(discountPercent) : undefined,
        priceBookId: priceBookId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-tiers'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : '保存失败'),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      cpqApi.updateTier(editTier!.id, {
        minQuantity,
        unitPrice: mode === 'unitPrice'
          ? (unitPrice === '' ? null : Number(unitPrice))
          : null,
        discountPercent: mode === 'discount'
          ? (discountPercent === '' ? null : Number(discountPercent))
          : null,
        isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-tiers'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : '保存失败'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!productId) return setError('请选择产品');
    if (minQuantity <= 0) return setError('最小数量必须大于 0');
    if (mode === 'unitPrice' && unitPrice === '') return setError('请输入阶梯单价');
    if (mode === 'discount' && discountPercent === '') return setError('请输入折扣百分比');
    if (mode === 'discount') {
      const d = Number(discountPercent);
      if (d < 0 || d > 100) return setError('折扣必须在 0–100 之间');
    }
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">{isEdit ? '编辑阶梯' : '新建阶梯'}</DialogTitle>
          <DialogDescription>
            可设置 “固定单价” 或 “折扣百分比”，两者择其一即可。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">产品</Label>
            <SelectPrimitive value={productId} onValueChange={setProductId} disabled={isEdit}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive placeholder="选择产品…" />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive className="max-h-72">
                {products.map((p) => (
                  <SelectItemPrimitive key={p.id} value={p.id}>
                    {p.name}{p.code ? ` (${p.code})` : ''}
                  </SelectItemPrimitive>
                ))}
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">最小数量</Label>
            <Input
              type="number"
              step="0.01"
              min={0.01}
              value={minQuantity}
              onChange={(e) => setMinQuantity(parseFloat(e.target.value) || 1)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">折扣方式</Label>
            <SelectPrimitive value={mode} onValueChange={(v) => setMode(v as 'unitPrice' | 'discount')}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive>
                <SelectItemPrimitive value="discount">折扣百分比</SelectItemPrimitive>
                <SelectItemPrimitive value="unitPrice">固定单价</SelectItemPrimitive>
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          {mode === 'unitPrice' ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">阶梯单价 (¥)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">折扣百分比 (0–100)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">价格簿 ID（可选）</Label>
            <Input
              value={priceBookId}
              onChange={(e) => setPriceBookId(e.target.value)}
              placeholder="留空适用所有价格簿"
              className="h-10 rounded-xl font-mono text-xs"
            />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">启用</Label>
              <SelectPrimitive value={isActive ? 'on' : 'off'} onValueChange={(v) => setIsActive(v === 'on')}>
                <SelectTriggerPrimitive className="h-10 rounded-xl">
                  <SelectValuePrimitive />
                </SelectTriggerPrimitive>
                <SelectContentPrimitive>
                  <SelectItemPrimitive value="on">启用</SelectItemPrimitive>
                  <SelectItemPrimitive value="off">停用</SelectItemPrimitive>
                </SelectContentPrimitive>
              </SelectPrimitive>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>取消</Button>
            <Button
              type="submit"
              className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
              disabled={createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
