'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { pageLayoutApi, adminApi, type PageLayoutRow } from '@/lib/api';
import { ObjectAdminHeader } from '../_object-header';
import { Plus, Pencil, Trash2, AlertTriangle, Layout as LayoutIcon, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export default function PageLayoutsPage() {
  const qc = useQueryClient();
  const params = useParams();
  const router = useRouter();
  const apiName = params.apiName as string;

  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState({ apiName: '', label: '' });
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PageLayoutRow | null>(null);

  const { data: objData } = useQuery({
    queryKey: ['admin-object', apiName],
    queryFn: () => adminApi.getObject(apiName),
  });
  const objLabel = objData?.data?.label ?? objData?.label;

  const { data: rows = [], isLoading } = useQuery<PageLayoutRow[]>({
    queryKey: ['pl-list', apiName],
    queryFn: () => pageLayoutApi.list(apiName),
  });

  const createMut = useMutation({
    mutationFn: (d: { apiName: string; label: string }) =>
      pageLayoutApi.create(apiName, {
        apiName: d.apiName.trim(),
        label: d.label.trim(),
        sections: [],
        isActive: true,
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['pl-list', apiName] });
      setShowModal(false);
      setDraft({ apiName: '', label: '' });
      if (created?.id) {
        router.push(`/admin/objects/${apiName}/page-layouts/${created.id}/edit`);
      }
    },
    onError: (err: unknown) => setError(extractMsg(err) ?? '创建失败'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => pageLayoutApi.remove(apiName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pl-list', apiName] });
      setPendingDelete(null);
    },
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      pageLayoutApi.update(apiName, id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pl-list', apiName] }),
  });

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <ObjectAdminHeader apiName={apiName} label={objLabel} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-ink">页面布局 (Page Layouts)</h2>
          <p className="text-xs text-slate-400 mt-0.5">为该对象配置一个或多个详情页布局，可被记录类型按需引用。</p>
        </div>
        <Button
          onClick={() => { setError(''); setShowModal(true); }}
          className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/20 h-10 px-5 font-bold rounded-xl"
        >
          <Plus className="mr-1.5 h-4 w-4" /> 新建布局
        </Button>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/30 overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="py-3 px-6 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">显示标签</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">API 名称</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">区块数</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">状态</TableHead>
                <TableHead className="w-[120px] text-right pr-6 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400 text-sm">加载中...</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center">
                    <LayoutIcon size={36} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-slate-400 font-bold text-sm">尚未配置任何页面布局</p>
                    <p className="text-slate-300 text-xs mt-1">点击「新建布局」开始配置</p>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((pl) => (
                <TableRow key={pl.id} className="group transition-colors hover:bg-slate-50/50">
                  <TableCell className="py-4 px-6 font-bold text-ink text-sm">{pl.label}</TableCell>
                  <TableCell className="py-4 font-mono text-[11px] text-slate-400 tracking-tight">{pl.apiName}</TableCell>
                  <TableCell className="py-4 text-xs text-slate-600 font-bold">{Array.isArray(pl.sections) ? pl.sections.length : 0}</TableCell>
                  <TableCell className="py-4">
                    <button
                      onClick={() => toggleActiveMut.mutate({ id: pl.id, isActive: !pl.isActive })}
                      className={`flex items-center gap-1.5 text-xs font-bold ${pl.isActive ? 'text-emerald-600' : 'text-slate-400'} hover:underline`}
                    >
                      <CheckCircle2 size={12} className={pl.isActive ? '' : 'opacity-30'} />
                      {pl.isActive ? '启用中' : '已停用'}
                    </button>
                  </TableCell>
                  <TableCell className="py-4 pr-6">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                        onClick={() => router.push(`/admin/objects/${apiName}/page-layouts/${pl.id}/edit`)}
                        title="编辑布局"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => setPendingDelete(pl)}
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={(v) => { if (!v) { setShowModal(false); setError(''); } }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <LayoutIcon size={17} />
              </div>
              新建页面布局
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">API 名称 *</Label>
              <Input
                value={draft.apiName}
                onChange={(e) => setDraft({ ...draft, apiName: e.target.value })}
                placeholder="default / domestic_layout"
                className="h-10 border-slate-200 font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400">apiName 为 <code className="font-mono bg-slate-100 px-1 rounded">default</code> 时，将作为该对象的默认布局。</p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">显示标签 *</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="标准布局"
                className="h-10 border-slate-200"
              />
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-xs font-bold">
                <Info size={14} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => { setShowModal(false); setError(''); }} className="font-bold">取消</Button>
            <Button
              disabled={createMut.isPending || !draft.apiName.trim() || !draft.label.trim()}
              onClick={() => { setError(''); createMut.mutate(draft); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-6 shadow-lg shadow-indigo-100"
            >
              {createMut.isPending ? '创建中...' : '创建并编辑'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingDelete && (
        <Dialog open onOpenChange={(v) => !v && setPendingDelete(null)}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertTriangle size={17} />
                </div>
                删除布局「{pendingDelete.label}」？
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-600 font-medium mt-2">
              如果有记录类型仍引用该布局，删除后它们将回退到默认布局。此操作不可撤销。
            </p>
            <DialogFooter className="mt-4">
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => setPendingDelete(null)}>取消</Button>
              <Button
                className="rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white"
                onClick={() => deleteMut.mutate(pendingDelete.id)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function extractMsg(err: unknown): string | undefined {
  const m = (err as any)?.response?.data?.message
    ?? (err as any)?.response?.data?.error?.message
    ?? (err as any)?.message;
  return Array.isArray(m) ? m.join('; ') : m;
}
