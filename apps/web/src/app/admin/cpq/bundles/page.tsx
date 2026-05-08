'use client';
// ─── /admin/cpq/bundles ────────────────────────────────────────────────────
// CPQ Bundle 列表 (Wave 20e)。每行点击进入 /admin/cpq/bundles/[id] 详情。

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cpqApi, productsApi } from '@/lib/api';
import { fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  Package, Plus, Loader2, RefreshCw, AlertCircle, Search, Layers,
} from 'lucide-react';

interface BundleRow {
  id: string;
  productId: string;
  type: string;
  fixedPrice: boolean;
  product?: { id: string; name: string; code?: string | null };
  items?: Array<{ id: string; childProductId: string }>;
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

export default function BundlesListPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch, error } = useQuery<BundleRow[]>({
    queryKey: ['cpq-bundles'],
    queryFn: () => cpqApi.listBundles(),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (b) =>
        b.product?.name?.toLowerCase().includes(q) ||
        b.product?.code?.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <Package size={20} />
            </div>
            CPQ Bundles
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            产品组合：将多个产品打包成可一次添加到报价单的捆绑包
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
            <Plus size={14} /> 新建 Bundle
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按产品名称 / 编号 / Bundle ID 过滤"
              className="h-10 rounded-xl pl-9"
            />
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
              <AlertCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <Package size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">
                {search ? '没有匹配的 Bundle' : '尚未创建 Bundle，点击右上角“新建 Bundle”'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">名称（父产品）</th>
                  <th className="px-6 py-3 text-left">类型</th>
                  <th className="px-6 py-3 text-left">定价模式</th>
                  <th className="px-6 py-3 text-right">子产品数</th>
                  <th className="px-6 py-3 text-right">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/admin/cpq/bundles/${b.id}`)}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-black text-ink">
                      <div className="flex items-center gap-2">
                        <span>{b.product?.name ?? '—'}</span>
                        {b.product?.code && (
                          <span className="text-[10px] font-mono text-slate-400 px-1.5 h-4 rounded bg-slate-100 inline-flex items-center">
                            {b.product.code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn(
                        'inline-flex items-center px-2 h-6 rounded-full text-[11px] font-bold',
                        b.type === 'all_or_nothing'
                          ? 'bg-violet-50 text-violet-700'
                          : 'bg-cyan-50 text-cyan-700',
                      )}>
                        {TYPE_ZH[b.type] ?? b.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {b.fixedPrice ? '固定定价' : '加总定价'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-right tabular-nums">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-slate-50 text-slate-700">
                        {b.items?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 text-right">
                      {fmtRelative(b.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateBundleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ─── Create-bundle modal ──────────────────────────────────────────────────

function CreateBundleDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [productId, setProductId] = useState('');
  const [type, setType] = useState<'configurable' | 'all_or_nothing'>('configurable');
  const [fixedPrice, setFixedPrice] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<{ data: ProductRow[] } | ProductRow[]>({
    queryKey: ['products-lookup', search],
    queryFn: () => productsApi.list({ search: search || undefined, take: 30 }),
    enabled: open,
  });

  const products: ProductRow[] = useMemo(() => {
    const raw: any = data ?? [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [data]);

  const createMut = useMutation({
    mutationFn: () => cpqApi.createBundle({ productId, type, fixedPrice }),
    onSuccess: (b: { id: string }) => {
      qc.invalidateQueries({ queryKey: ['cpq-bundles'] });
      onOpenChange(false);
      reset();
      router.push(`/admin/cpq/bundles/${b.id}`);
    },
  });

  function reset() {
    setProductId('');
    setType('configurable');
    setFixedPrice(false);
    setSearch('');
  }

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) reset(); onOpenChange(b); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Package size={20} /> 新建 Bundle
          </DialogTitle>
          <DialogDescription>
            选择一个 “父产品” 作为 Bundle 的封装载体，然后在详情页里添加它的子产品。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              父产品 <span className="text-red-400">*</span>
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
            ) : products.length === 0 ? (
              <div className="p-3 text-center text-xs font-bold text-slate-400">无匹配产品</div>
            ) : (
              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
                {products.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      'px-3 py-2.5 hover:bg-slate-50 cursor-pointer text-sm',
                      productId === p.id && 'bg-brand/5',
                    )}
                    onClick={() => setProductId(p.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-ink truncate">{p.name}</div>
                      {p.code && (
                        <span className="text-[10px] font-mono text-slate-400">{p.code}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                  <SelectItemPrimitive value="sum">加总定价</SelectItemPrimitive>
                  <SelectItemPrimitive value="fixed">固定定价</SelectItemPrimitive>
                </SelectContentPrimitive>
              </SelectPrimitive>
            </div>
          </div>

          {createMut.isError && (
            <div className="text-xs font-bold text-red-600">
              创建失败：{(createMut.error as Error)?.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white gap-2 font-bold"
            disabled={!productId || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// suppress unused
void Layers;
