'use client';
// ─── /admin/cpq/bundles/[id] ─────────────────────────────────────────────
// CPQ Bundle 详情：编辑类型/定价模式 + 子产品管理 (Wave 20e)。

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cpqApi, productsApi } from '@/lib/api';
import { cn, fmtRelative } from '@/lib/utils';
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
  ArrowLeft, Package, Plus, Loader2, AlertCircle, XCircle, Trash2,
  CheckCircle2, Edit3, Search, Pencil,
} from 'lucide-react';

interface BundleDetail {
  id: string;
  productId: string;
  type: string;
  fixedPrice: boolean;
  product?: { id: string; name: string; code?: string | null };
  items: Array<{
    id: string;
    childProductId: string;
    childProduct?: { id: string; name: string; code?: string | null };
    required: boolean;
    defaultQuantity: number | string;
    minQuantity: number | string;
    maxQuantity: number | string | null;
    displayOrder: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface ProductRow {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
}

const TYPE_ZH: Record<string, string> = {
  configurable: '可配置',
  all_or_nothing: '全选或不选',
};

export default function BundleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const qc = useQueryClient();

  const [headerEditOpen, setHeaderEditOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);

  const { data: bundle, isLoading, error } = useQuery<BundleDetail>({
    queryKey: ['cpq-bundle', id],
    queryFn: () => cpqApi.getBundle(id),
    enabled: !!id,
  });

  const removeItemMut = useMutation({
    mutationFn: (itemId: string) => cpqApi.removeBundleItem(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cpq-bundle', id] }),
  });

  const deleteBundleMut = useMutation({
    mutationFn: () => cpqApi.deleteBundle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-bundles'] });
      router.push('/admin/cpq/bundles');
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }
  if (error || !bundle) {
    return (
      <div className="p-16 text-center">
        <XCircle size={28} className="mx-auto text-red-300 mb-3" />
        <p className="text-base font-black text-red-500">
          {error ? `加载失败：${(error as Error).message}` : 'Bundle 不存在'}
        </p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push('/admin/cpq/bundles')}>
          返回列表
        </Button>
      </div>
    );
  }

  const editingItem = bundle.items.find((it) => it.id === editItemId) ?? null;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back */}
      <Button
        variant="ghost"
        className="h-8 -ml-2 rounded-xl gap-1.5 font-bold text-slate-500"
        onClick={() => router.push('/admin/cpq/bundles')}
      >
        <ArrowLeft size={14} /> 返回 Bundle 列表
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Package size={20} />
            </div>
            {bundle.product?.name ?? '(无父产品)'}
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={cn(
              'inline-flex items-center px-2 h-6 rounded-full text-[11px] font-bold',
              bundle.type === 'all_or_nothing'
                ? 'bg-violet-50 text-violet-700'
                : 'bg-cyan-50 text-cyan-700',
            )}>
              {TYPE_ZH[bundle.type] ?? bundle.type}
            </span>
            <span className="inline-flex items-center px-2 h-6 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
              {bundle.fixedPrice ? '固定定价' : '加总定价'}
            </span>
            {bundle.product?.code && (
              <span className="text-[11px] font-mono text-slate-400 px-2 h-6 rounded-full bg-slate-50 inline-flex items-center">
                {bundle.product.code}
              </span>
            )}
            <span className="text-[11px] font-bold text-slate-400">
              更新于 {fmtRelative(bundle.updatedAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => setHeaderEditOpen(true)}
          >
            <Edit3 size={14} /> 编辑
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2 text-red-500 hover:bg-red-50 hover:text-red-600 border-red-100"
            onClick={() => {
              if (confirm(`确定要删除 Bundle “${bundle.product?.name ?? ''}” 吗？此操作不可撤销。`)) {
                deleteBundleMut.mutate();
              }
            }}
            disabled={deleteBundleMut.isPending}
          >
            <Trash2 size={14} /> 删除
          </Button>
        </div>
      </div>

      {/* Items table */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">子产品（{bundle.items.length}）</h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              加入此 Bundle 的产品；添加到报价单时会展开为多行
            </p>
          </div>
          <Button
            size="sm"
            className="bg-ink hover:bg-slate-800 text-white rounded-xl font-bold h-9 px-4 gap-1.5"
            onClick={() => setAddItemOpen(true)}
          >
            <Plus size={12} /> 添加子产品
          </Button>
        </div>

        {bundle.items.length === 0 ? (
          <div className="p-16 text-center">
            <Package size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-base font-black text-slate-400">尚未添加子产品</p>
          </div>
        ) : (
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">子产品</th>
                  <th className="px-6 py-3 text-center">必选</th>
                  <th className="px-6 py-3 text-right">默认数量</th>
                  <th className="px-6 py-3 text-right">最小</th>
                  <th className="px-6 py-3 text-right">最大</th>
                  <th className="px-6 py-3 text-right">排序</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bundle.items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-4 text-sm font-bold text-ink">
                      <div className="flex items-center gap-2">
                        <span>{it.childProduct?.name ?? it.childProductId}</span>
                        {it.childProduct?.code && (
                          <span className="text-[10px] font-mono text-slate-400 px-1.5 h-4 rounded bg-slate-100 inline-flex items-center">
                            {it.childProduct.code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {it.required ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 size={12} /> 必选
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs font-bold">可选</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums font-bold">{Number(it.defaultQuantity)}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums text-slate-500">{Number(it.minQuantity)}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums text-slate-500">
                      {it.maxQuantity == null ? '—' : Number(it.maxQuantity)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums text-slate-400">{it.displayOrder}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl p-0"
                          onClick={() => setEditItemId(it.id)}
                          title="编辑"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl p-0 text-red-400 hover:bg-red-50 hover:text-red-500"
                          onClick={() => {
                            if (confirm(`移除子产品 “${it.childProduct?.name ?? it.childProductId}”？`)) {
                              removeItemMut.mutate(it.id);
                            }
                          }}
                          disabled={removeItemMut.isPending}
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      <EditHeaderDialog
        open={headerEditOpen}
        onOpenChange={setHeaderEditOpen}
        bundle={bundle}
      />
      <ItemDialog
        open={addItemOpen || !!editingItem}
        onOpenChange={(b) => {
          if (!b) {
            setAddItemOpen(false);
            setEditItemId(null);
          }
        }}
        bundleId={id}
        item={editingItem}
      />
    </div>
  );
}

// ─── Edit header (type / fixedPrice) ──────────────────────────────────────

function EditHeaderDialog({
  open, onOpenChange, bundle,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  bundle: BundleDetail;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<'configurable' | 'all_or_nothing'>(bundle.type as never);
  const [fixedPrice, setFixedPrice] = useState(bundle.fixedPrice);

  const mut = useMutation({
    mutationFn: () => cpqApi.updateBundle(bundle.id, { type, fixedPrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-bundle', bundle.id] });
      qc.invalidateQueries({ queryKey: ['cpq-bundles'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">编辑 Bundle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">类型</Label>
            <SelectPrimitive value={type} onValueChange={(v) => setType(v as 'configurable' | 'all_or_nothing')}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive>
                <SelectItemPrimitive value="configurable">可配置</SelectItemPrimitive>
                <SelectItemPrimitive value="all_or_nothing">全选或不选</SelectItemPrimitive>
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">定价模式</Label>
            <SelectPrimitive value={fixedPrice ? 'fixed' : 'sum'} onValueChange={(v) => setFixedPrice(v === 'fixed')}>
              <SelectTriggerPrimitive className="h-10 rounded-xl">
                <SelectValuePrimitive />
              </SelectTriggerPrimitive>
              <SelectContentPrimitive>
                <SelectItemPrimitive value="sum">加总定价（子产品合计）</SelectItemPrimitive>
                <SelectItemPrimitive value="fixed">固定定价（子产品按比例分摊）</SelectItemPrimitive>
              </SelectContentPrimitive>
            </SelectPrimitive>
          </div>
          {mut.isError && (
            <div className="text-xs font-bold text-red-600">保存失败：{(mut.error as Error)?.message}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add / edit BundleItem ────────────────────────────────────────────────

function ItemDialog({
  open, onOpenChange, bundleId, item,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  bundleId: string;
  item: BundleDetail['items'][number] | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!item;

  const [childProductId, setChildProductId] = useState(item?.childProductId ?? '');
  const [search, setSearch] = useState('');
  const [required, setRequired] = useState<boolean>(item ? item.required : true);
  const [defaultQuantity, setDefaultQuantity] = useState<number>(item ? Number(item.defaultQuantity) : 1);
  const [minQuantity, setMinQuantity] = useState<number>(item ? Number(item.minQuantity) : 1);
  const [maxQuantity, setMaxQuantity] = useState<string>(
    item?.maxQuantity == null ? '' : String(Number(item.maxQuantity)),
  );
  const [displayOrder, setDisplayOrder] = useState<number>(item ? item.displayOrder : 0);
  const [error, setError] = useState('');

  // Reset when opening for a different item
  useMemo(() => {
    if (open) {
      setChildProductId(item?.childProductId ?? '');
      setSearch('');
      setRequired(item ? item.required : true);
      setDefaultQuantity(item ? Number(item.defaultQuantity) : 1);
      setMinQuantity(item ? Number(item.minQuantity) : 1);
      setMaxQuantity(item?.maxQuantity == null ? '' : String(Number(item!.maxQuantity)));
      setDisplayOrder(item ? item.displayOrder : 0);
      setError('');
    }
  }, [open, item]);

  const { data, isLoading } = useQuery<{ data: ProductRow[] } | ProductRow[]>({
    queryKey: ['products-lookup', search],
    queryFn: () => productsApi.list({ search: search || undefined, take: 30 }),
    enabled: open && !isEdit,
  });
  const products: ProductRow[] = useMemo(() => {
    const raw: any = data ?? [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [data]);

  const addMut = useMutation({
    mutationFn: () =>
      cpqApi.addBundleItem(bundleId, {
        childProductId,
        required,
        defaultQuantity,
        minQuantity,
        maxQuantity: maxQuantity === '' ? undefined : Number(maxQuantity),
        displayOrder,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-bundle', bundleId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : '保存失败'),
  });

  const editMut = useMutation({
    mutationFn: () =>
      cpqApi.updateBundleItem(bundleId, item!.id, {
        required,
        defaultQuantity,
        minQuantity,
        maxQuantity: maxQuantity === '' ? undefined : Number(maxQuantity),
        displayOrder,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpq-bundle', bundleId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : '保存失败'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isEdit && !childProductId) return setError('请选择子产品');
    if (defaultQuantity <= 0) return setError('默认数量必须大于 0');
    if (minQuantity < 0) return setError('最小数量不能为负');
    if (maxQuantity !== '' && Number(maxQuantity) < minQuantity) return setError('最大数量必须 ≥ 最小数量');
    if (isEdit) editMut.mutate();
    else addMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">{isEdit ? '编辑子产品' : '添加子产品'}</DialogTitle>
          <DialogDescription>
            子产品在加入报价单时会按 “默认数量 × Bundle 数量” 自动展开。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                子产品 <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索产品名称 / 编号"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              {isLoading ? (
                <div className="p-3 text-center text-xs font-bold text-slate-400">
                  <Loader2 size={14} className="animate-spin mx-auto" />
                </div>
              ) : (
                <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className={cn(
                        'px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm',
                        childProductId === p.id && 'bg-brand/5',
                      )}
                      onClick={() => setChildProductId(p.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink truncate">{p.name}</span>
                        {p.code && <span className="text-[10px] font-mono text-slate-400">{p.code}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">必选</Label>
              <SelectPrimitive value={required ? 'yes' : 'no'} onValueChange={(v) => setRequired(v === 'yes')}>
                <SelectTriggerPrimitive className="h-10 rounded-xl">
                  <SelectValuePrimitive />
                </SelectTriggerPrimitive>
                <SelectContentPrimitive>
                  <SelectItemPrimitive value="yes">必选</SelectItemPrimitive>
                  <SelectItemPrimitive value="no">可选</SelectItemPrimitive>
                </SelectContentPrimitive>
              </SelectPrimitive>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">默认数量</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={defaultQuantity}
                onChange={(e) => setDefaultQuantity(parseFloat(e.target.value) || 0)}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">最小数量</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={minQuantity}
                onChange={(e) => setMinQuantity(parseFloat(e.target.value) || 0)}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">最大数量（可选）</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={maxQuantity}
                onChange={(e) => setMaxQuantity(e.target.value)}
                placeholder="不限"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">排序</Label>
              <Input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
              disabled={addMut.isPending || editMut.isPending}
            >
              {(addMut.isPending || editMut.isPending) ? (
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
