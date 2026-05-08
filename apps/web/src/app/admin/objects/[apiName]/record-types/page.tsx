'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  recordTypeApi, pageLayoutApi, adminApi,
  type RecordTypeRow, type PageLayoutRow,
} from '@/lib/api';
import { ObjectAdminHeader } from '../_object-header';
import { Plus, Pencil, Trash2, AlertTriangle, Tag, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface RecordTypeDraft {
  apiName: string;
  label: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  layoutId: string;
}

const EMPTY_DRAFT: RecordTypeDraft = {
  apiName: '',
  label: '',
  description: '',
  isDefault: false,
  isActive: true,
  layoutId: '',
};

const NONE_VALUE = '__none__';

export default function RecordTypesPage() {
  const qc = useQueryClient();
  const params = useParams();
  const apiName = params.apiName as string;

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecordTypeRow | null>(null);
  const [draft, setDraft] = useState<RecordTypeDraft>(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<RecordTypeRow | null>(null);

  const { data: objData } = useQuery({
    queryKey: ['admin-object', apiName],
    queryFn: () => adminApi.getObject(apiName),
  });
  const objLabel = objData?.data?.label ?? objData?.label;

  const { data: rows = [], isLoading } = useQuery<RecordTypeRow[]>({
    queryKey: ['rt-list', apiName],
    queryFn: () => recordTypeApi.list(apiName),
  });

  const { data: layouts = [] } = useQuery<PageLayoutRow[]>({
    queryKey: ['pl-list', apiName],
    queryFn: () => pageLayoutApi.list(apiName),
  });

  const createMut = useMutation({
    mutationFn: (d: RecordTypeDraft) => recordTypeApi.create(apiName, {
      apiName: d.apiName.trim(),
      label: d.label.trim(),
      description: d.description.trim() || undefined,
      isDefault: d.isDefault,
      isActive: d.isActive,
      layoutId: d.layoutId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rt-list', apiName] });
      closeModal();
    },
    onError: (err: unknown) => setError(extractMsg(err) ?? '创建失败'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: RecordTypeDraft }) =>
      recordTypeApi.update(apiName, id, {
        label: d.label.trim(),
        description: d.description.trim() || null,
        isDefault: d.isDefault,
        isActive: d.isActive,
        layoutId: d.layoutId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rt-list', apiName] });
      closeModal();
    },
    onError: (err: unknown) => setError(extractMsg(err) ?? '保存失败'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => recordTypeApi.remove(apiName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rt-list', apiName] });
      setPendingDelete(null);
    },
  });

  function openNew() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError('');
    setShowModal(true);
  }

  function openEdit(rt: RecordTypeRow) {
    setEditing(rt);
    setDraft({
      apiName: rt.apiName,
      label: rt.label,
      description: rt.description ?? '',
      isDefault: rt.isDefault,
      isActive: rt.isActive,
      layoutId: rt.layoutId ?? '',
    });
    setError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError('');
  }

  function tryDelete(rt: RecordTypeRow) {
    if (rt.isDefault) {
      const others = rows.filter((r) => r.id !== rt.id && r.isActive);
      if (others.length > 0 && !others.some((r) => r.isDefault)) {
        setError(`「${rt.label}」是默认子类型。请先把另一个子类型设为默认后再删除。`);
        return;
      }
    }
    setPendingDelete(rt);
  }

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <ObjectAdminHeader apiName={apiName} label={objLabel} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-ink">记录类型 (Record Types)</h2>
          <p className="text-xs text-slate-400 mt-0.5">为该对象定义业务子类型；每个子类型可绑定独立的页面布局与下拉选项覆盖。</p>
        </div>
        <Button
          onClick={openNew}
          className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/20 h-10 px-5 font-bold rounded-xl"
        >
          <Plus className="mr-1.5 h-4 w-4" /> 新建子类型
        </Button>
      </div>

      {error && !showModal && !pendingDelete && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-xs font-bold">
          <Info size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <Card className="border-none shadow-xl shadow-slate-200/30 overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="py-3 px-6 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">显示标签</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">API 名称</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">状态</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">默认</TableHead>
                <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">绑定布局</TableHead>
                <TableHead className="w-[120px] text-right pr-6 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400 text-sm">加载中...</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <Tag size={36} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-slate-400 font-bold text-sm">尚未配置任何记录类型</p>
                    <p className="text-slate-300 text-xs mt-1">创建子类型可以为不同业务流程绑定不同布局与选项</p>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((rt) => (
                <TableRow key={rt.id} className="group transition-colors hover:bg-slate-50/50">
                  <TableCell className="py-4 px-6 font-bold text-ink text-sm">{rt.label}</TableCell>
                  <TableCell className="py-4 font-mono text-[11px] text-slate-400 tracking-tight">{rt.apiName}</TableCell>
                  <TableCell className="py-4">
                    <ActiveToggle
                      active={rt.isActive}
                      onToggle={() => updateMut.mutate({ id: rt.id, d: { ...toDraft(rt), isActive: !rt.isActive } })}
                    />
                  </TableCell>
                  <TableCell className="py-4">
                    {rt.isDefault ? (
                      <Badge className="bg-amber-50 text-amber-600 border-none font-bold text-[10px] h-5">默认</Badge>
                    ) : (
                      <span className="text-slate-200 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-xs">
                    {rt.layout ? (
                      <span className="font-mono text-slate-600">{rt.layout.label}</span>
                    ) : (
                      <span className="text-slate-300">默认布局</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4 pr-6">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" onClick={() => openEdit(rt)} title="编辑">
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50" onClick={() => tryDelete(rt)} title="删除">
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

      {/* Create / Edit Dialog */}
      <Dialog open={showModal} onOpenChange={(v) => !v && closeModal()}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Tag size={17} />
              </div>
              {editing ? '编辑记录类型' : '新建记录类型'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">API 名称 *</Label>
                <Input
                  value={draft.apiName}
                  onChange={(e) => setDraft({ ...draft, apiName: e.target.value })}
                  placeholder="domestic"
                  className="h-10 border-slate-200 font-mono text-xs"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">显示标签 *</Label>
                <Input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="国内商机"
                  className="h-10 border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">描述</Label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="（可选）该子类型的业务说明"
                className="h-10 border-slate-200 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">绑定页面布局</Label>
              <Select
                value={draft.layoutId || NONE_VALUE}
                onValueChange={(v) => setDraft({ ...draft, layoutId: v === NONE_VALUE ? '' : v })}
              >
                <SelectTrigger className="h-10 border-slate-200">
                  <SelectValue placeholder="使用对象默认布局" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>使用对象默认布局</SelectItem>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label} <span className="font-mono text-slate-400 ml-1">({l.apiName})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rt-default"
                  checked={draft.isDefault}
                  onCheckedChange={(c) => setDraft({ ...draft, isDefault: !!c })}
                />
                <Label htmlFor="rt-default" className="text-xs font-bold cursor-pointer">设为默认子类型</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rt-active"
                  checked={draft.isActive}
                  onCheckedChange={(c) => setDraft({ ...draft, isActive: !!c })}
                />
                <Label htmlFor="rt-active" className="text-xs font-bold cursor-pointer">启用</Label>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-xs font-bold">
                <Info size={14} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={closeModal} className="font-bold">取消</Button>
            <Button
              disabled={createMut.isPending || updateMut.isPending || !draft.label.trim() || (!editing && !draft.apiName.trim())}
              onClick={() => {
                setError('');
                if (editing) updateMut.mutate({ id: editing.id, d: draft });
                else createMut.mutate(draft);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-6 shadow-lg shadow-indigo-100"
            >
              {createMut.isPending || updateMut.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      {pendingDelete && (
        <Dialog open onOpenChange={(v) => !v && setPendingDelete(null)}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertTriangle size={17} />
                </div>
                删除「{pendingDelete.label}」？
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-600 font-medium mt-2">
              该子类型下的现有记录将失去 RecordType 关联，但不会被删除。请确认操作。
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

function toDraft(rt: RecordTypeRow): RecordTypeDraft {
  return {
    apiName: rt.apiName,
    label: rt.label,
    description: rt.description ?? '',
    isDefault: rt.isDefault,
    isActive: rt.isActive,
    layoutId: rt.layoutId ?? '',
  };
}

function ActiveToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 text-xs font-bold ${active ? 'text-emerald-600' : 'text-slate-400'} hover:underline`}
    >
      <CheckCircle2 size={12} className={active ? '' : 'opacity-30'} />
      {active ? '启用中' : '已停用'}
    </button>
  );
}

function extractMsg(err: unknown): string | undefined {
  const m = (err as any)?.response?.data?.message
    ?? (err as any)?.response?.data?.error?.message
    ?? (err as any)?.message;
  return Array.isArray(m) ? m.join('; ') : m;
}
