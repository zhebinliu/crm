'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { fmtDate, cn } from '@/lib/utils';
import { ArrowLeft, Plus, Trash2, Tag, Database, ShieldCheck, Box, Info, Layout } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';

// Mirrors enum FieldType in packages/db/prisma/schema.prisma — keep in sync.
const FIELD_TYPES: { value: string; label: string; group: string }[] = [
  { value: 'STRING',         label: '短文本 (STRING)',           group: '文本' },
  { value: 'TEXT',           label: '长文本 (TEXT)',             group: '文本' },
  { value: 'EMAIL',          label: '邮箱 (EMAIL)',              group: '文本' },
  { value: 'PHONE',          label: '电话 (PHONE)',              group: '文本' },
  { value: 'URL',            label: '链接 (URL)',                group: '文本' },
  { value: 'NUMBER',         label: '整数 (NUMBER)',             group: '数字' },
  { value: 'DECIMAL',        label: '小数 (DECIMAL)',            group: '数字' },
  { value: 'CURRENCY',       label: '货币 (CURRENCY)',           group: '数字' },
  { value: 'BOOLEAN',        label: '布尔 (BOOLEAN)',            group: '其他' },
  { value: 'DATE',           label: '日期 (DATE)',               group: '日期' },
  { value: 'DATETIME',       label: '日期时间 (DATETIME)',       group: '日期' },
  { value: 'PICKLIST',       label: '下拉单选 (PICKLIST)',       group: '选项' },
  { value: 'MULTI_PICKLIST', label: '下拉多选 (MULTI_PICKLIST)', group: '选项' },
  { value: 'REFERENCE',      label: '关联引用 (REFERENCE)',      group: '关系' },
  { value: 'FORMULA',        label: '公式 (FORMULA)',            group: '高级' },
  { value: 'JSON',           label: '结构化 JSON (JSON)',        group: '高级' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.value, t.label.split(' (')[0]!]),
);

const TYPE_STYLE: Record<string, string> = {
  STRING: 'bg-blue-50 text-blue-600',
  TEXT: 'bg-blue-50 text-blue-600',
  EMAIL: 'bg-pink-50 text-pink-600',
  PHONE: 'bg-pink-50 text-pink-600',
  URL: 'bg-pink-50 text-pink-600',
  NUMBER: 'bg-amber-50 text-amber-600',
  DECIMAL: 'bg-amber-50 text-amber-600',
  CURRENCY: 'bg-emerald-50 text-emerald-600',
  BOOLEAN: 'bg-violet-50 text-violet-600',
  DATE: 'bg-slate-100 text-slate-600',
  DATETIME: 'bg-slate-100 text-slate-600',
  PICKLIST: 'bg-orange-50 text-orange-600',
  MULTI_PICKLIST: 'bg-orange-50 text-orange-600',
  REFERENCE: 'bg-indigo-50 text-indigo-600',
  FORMULA: 'bg-fuchsia-50 text-fuchsia-600',
  JSON: 'bg-slate-100 text-slate-600',
};

// Standard objects that REFERENCE fields can target.
const REFERENCE_TARGETS = [
  { value: 'Account',     label: '客户 (Account)' },
  { value: 'Contact',     label: '联系人 (Contact)' },
  { value: 'Lead',        label: '线索 (Lead)' },
  { value: 'Opportunity', label: '商机 (Opportunity)' },
  { value: 'User',        label: '用户 (User)' },
  { value: 'Product',     label: '产品 (Product)' },
];

interface Field {
  id: string;
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  unique: boolean;
  isSystem: boolean;
  isCustom: boolean;
  createdAt: string;
}

interface ObjectDef {
  apiName: string;
  label: string;
  labelPlural: string;
  isSystem: boolean;
  fields: Field[];
}

interface PicklistValueDraft { value: string; label: string; color: string }

interface NewFieldDraft {
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  helpText: string;
  // PICKLIST / MULTI_PICKLIST: either pick existing or create inline values
  picklistId: string;
  picklistValues: PicklistValueDraft[];
  // REFERENCE
  referenceTo: string;
}

const EMPTY_NEW_FIELD: NewFieldDraft = {
  apiName: '', label: '', type: 'STRING', required: false, helpText: '',
  picklistId: '', picklistValues: [{ value: '', label: '', color: '' }],
  referenceTo: '',
};

export default function MetadataObjectPage() {
  const qc = useQueryClient();
  const params = useParams();
  const objectName = params.objectName as string;
  const [showAdd, setShowAdd] = useState(false);
  const [newField, setNewField] = useState<NewFieldDraft>(EMPTY_NEW_FIELD);
  const [error, setError] = useState('');

  const { data: existingPicklists } = useQuery<Array<{ id: string; apiName: string; label: string }>>({
    queryKey: ['admin-picklists'],
    queryFn: () => adminApi.listPicklists(),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-object', objectName],
    queryFn: () => adminApi.getObject(objectName),
  });

  const obj: ObjectDef | null = data?.data ?? data ?? null;
  const fields: Field[] = obj?.fields ?? [];
  const systemFields = fields.filter((f) => f.isSystem);
  const customFields = fields.filter((f) => f.isCustom).sort((a, b) => a.apiName.localeCompare(b.apiName));

  const createMutation = useMutation({
    mutationFn: (d: NewFieldDraft) => {
      const payload: Record<string, unknown> = {
        apiName: d.apiName.trim(),
        label: d.label.trim(),
        type: d.type,
        required: d.required,
        ...(d.helpText.trim() ? { helpText: d.helpText.trim() } : {}),
      };
      if (d.type === 'PICKLIST' || d.type === 'MULTI_PICKLIST') {
        if (d.picklistId) {
          payload.picklistId = d.picklistId;
        } else {
          const valid = d.picklistValues.filter((v) => v.value.trim() && v.label.trim());
          if (valid.length === 0) throw new Error('请至少添加一个下拉选项（编码 + 显示名）');
          payload.picklistInline = {
            values: valid.map((v, i) => ({
              value: v.value.trim(),
              label: v.label.trim(),
              color: v.color.trim() || undefined,
              displayOrder: i,
            })),
          };
        }
      }
      if (d.type === 'REFERENCE') {
        if (!d.referenceTo) throw new Error('请选择关联的目标对象');
        payload.referenceTo = d.referenceTo;
      }
      return adminApi.createField(objectName, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-object', objectName] });
      qc.invalidateQueries({ queryKey: ['admin-picklists'] });
      setShowAdd(false);
      setNewField(EMPTY_NEW_FIELD);
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message
        ?? (err as any)?.response?.data?.error?.message
        ?? (err as any)?.message;
      setError(Array.isArray(msg) ? msg.join('; ') : (msg ?? '创建失败'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteField(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-object', objectName] }),
  });

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* Navigation & Header */}
      <div className="space-y-6">
        <Link href="/admin/metadata">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-indigo-600 gap-2 mb-2 p-0 h-auto">
            <ArrowLeft size={14} /> 返回对象模型列表
          </Button>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border",
              obj?.isSystem ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-violet-50 text-violet-600 border-violet-100"
            )}>
              <Database size={28} />
            </div>
            <div>
               <div className="flex items-center gap-3">
                 <h1 className="text-3xl font-black tracking-tight text-ink">{obj?.label || objectName}</h1>
                 {obj?.isSystem && <Badge className="bg-indigo-100 text-indigo-600 border-none font-black text-[10px] h-4">SYSTEM</Badge>}
               </div>
               <p className="text-sm font-mono text-ink-secondary mt-1 tracking-tight">API NAME: {objectName.toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/admin/metadata/${objectName}/layout-editor`}>
              <Button variant="outline" className="border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 h-11 px-5 font-bold rounded-xl gap-2">
                <Layout size={15} /> 配置页面布局
              </Button>
            </Link>
            <Button onClick={() => setShowAdd(!showAdd)} className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/20 h-11 px-6 font-bold rounded-xl">
              {showAdd ? '收起表单' : <><Plus className="mr-2 h-4 w-4" /> 新增模型字段</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Add Field Form Card */}
      {showAdd && (
        <Card className="border-none shadow-2xl shadow-indigo-100 bg-white overflow-hidden animate-in slide-in-from-top-4 duration-300">
          <CardHeader className="bg-slate-50/50 border-b border-slate-50 px-8 py-4">
             <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Plus size={14} className="text-brand" /> 扩展对象定义
             </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            {/* Row 1: API name / Label / Type / Required */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">API 名称 *</Label>
                <Input
                  value={newField.apiName}
                  onChange={(e) => setNewField({ ...newField, apiName: e.target.value })}
                  placeholder="custom_field__c"
                  className="h-10 border-slate-200 font-mono text-xs"
                />
                <p className="text-[10px] font-medium text-slate-400">建议小写下划线命名，自定义字段以 __c 结尾</p>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">字段展示标签 *</Label>
                <Input
                  value={newField.label}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="例如：客户等级"
                  className="h-10 border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">数据类型</Label>
                <Select value={newField.type} onValueChange={(val) => setNewField({ ...newField, type: val, picklistId: '', picklistValues: [{ value: '', label: '', color: '' }], referenceTo: '' })}>
                  <SelectTrigger className="h-10 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {(['文本','数字','日期','选项','其他','关系','高级'] as const).map((g) => (
                      <div key={g}>
                        <div className="px-2 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">{g}</div>
                        {FIELD_TYPES.filter((t) => t.group === g).map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-sm font-bold">
                            {t.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-3 pb-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is-required"
                    checked={newField.required}
                    onCheckedChange={(checked) => setNewField({ ...newField, required: !!checked })}
                  />
                  <Label htmlFor="is-required" className="text-xs font-bold cursor-pointer">设为必填字段</Label>
                </div>
              </div>
            </div>

            {/* Help text */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">帮助说明（可选）</Label>
              <Input
                value={newField.helpText}
                onChange={(e) => setNewField({ ...newField, helpText: e.target.value })}
                placeholder="表单上字段下方的简短提示文字"
                className="h-9 border-slate-200 text-sm"
              />
            </div>

            {/* PICKLIST / MULTI_PICKLIST: existing or inline values */}
            {(newField.type === 'PICKLIST' || newField.type === 'MULTI_PICKLIST') && (
              <div className="rounded-2xl bg-orange-50/40 border border-orange-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-orange-600 tracking-wider">
                    下拉选项配置
                  </Label>
                  {(existingPicklists?.length ?? 0) > 0 && (
                    <Select
                      value={newField.picklistId || '__inline'}
                      onValueChange={(v) => setNewField({ ...newField, picklistId: v === '__inline' ? '' : v })}
                    >
                      <SelectTrigger className="h-8 w-64 border-orange-200 text-xs">
                        <SelectValue placeholder="使用现有选项库或新建" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__inline">— 在下方新建一组选项 —</SelectItem>
                        {(existingPicklists ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label} ({p.apiName})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {!newField.picklistId && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-500">
                      为该字段定义可选项。<span className="font-mono">编码</span>是存储到数据库的值，<span className="font-mono">显示名</span>是用户看到的文本。
                    </p>
                    {newField.picklistValues.map((v, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <Input
                            value={v.value}
                            onChange={(e) => {
                              const next = [...newField.picklistValues];
                              next[i] = { ...next[i]!, value: e.target.value };
                              setNewField({ ...newField, picklistValues: next });
                            }}
                            placeholder="编码 hot"
                            className="h-9 text-sm font-mono border-orange-200/70"
                          />
                        </div>
                        <div className="col-span-5">
                          <Input
                            value={v.label}
                            onChange={(e) => {
                              const next = [...newField.picklistValues];
                              next[i] = { ...next[i]!, label: e.target.value };
                              setNewField({ ...newField, picklistValues: next });
                            }}
                            placeholder="显示名 热客户"
                            className="h-9 text-sm border-orange-200/70"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={v.color}
                            onChange={(e) => {
                              const next = [...newField.picklistValues];
                              next[i] = { ...next[i]!, color: e.target.value };
                              setNewField({ ...newField, picklistValues: next });
                            }}
                            placeholder="#ef4444"
                            className="h-9 text-xs font-mono border-orange-200/70"
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-300 hover:text-red-500"
                            onClick={() => {
                              const next = newField.picklistValues.filter((_, j) => j !== i);
                              setNewField({ ...newField, picklistValues: next.length > 0 ? next : [{ value: '', label: '', color: '' }] });
                            }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl h-8 font-bold gap-1 border-orange-200 text-orange-600 hover:bg-orange-100 text-xs"
                      onClick={() => setNewField({
                        ...newField,
                        picklistValues: [...newField.picklistValues, { value: '', label: '', color: '' }],
                      })}
                    >
                      <Plus size={12} /> 添加选项
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* REFERENCE: target object selector */}
            {newField.type === 'REFERENCE' && (
              <div className="rounded-2xl bg-indigo-50/40 border border-indigo-100 p-5 space-y-2">
                <Label className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">关联目标对象 *</Label>
                <Select value={newField.referenceTo} onValueChange={(v) => setNewField({ ...newField, referenceTo: v })}>
                  <SelectTrigger className="h-10 border-indigo-200">
                    <SelectValue placeholder="选择此字段引用哪个对象" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_TARGETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 font-medium">
                  保存后，该字段在表单中会显示为对应对象的查找选择器。
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-xs font-bold">
                <Info size={14} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-6 border-t border-slate-50">
              <Button variant="ghost" onClick={() => { setShowAdd(false); setError(''); setNewField(EMPTY_NEW_FIELD); }} className="font-bold">取消</Button>
              <Button
                disabled={createMutation.isPending || !newField.apiName.trim() || !newField.label.trim()}
                onClick={() => { setError(''); createMutation.mutate(newField); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-8 shadow-lg shadow-indigo-100"
              >
                {createMutation.isPending ? '正在创建...' : '保存字段定义'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tables Section */}
      <div className="space-y-10">
        {isLoading && (
          <div className="py-20 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-100">
            正在解构对象元数据...
          </div>
        )}

        {customFields.length > 0 && (
          <div className="space-y-4">
             <div className="flex items-center gap-2 px-2">
                <Box size={14} className="text-slate-400" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">扩展字段 (Custom Fields)</h2>
             </div>
             <Card className="border-none shadow-xl shadow-slate-200/30 overflow-hidden rounded-3xl">
               <CardContent className="p-0">
                  <FieldTable fields={customFields} onDelete={(id) => {
                    if (confirm('确认删除此字段？该操作将永久移除相关存储空间。')) deleteMutation.mutate(id);
                  }} />
               </CardContent>
             </Card>
          </div>
        )}

        {systemFields.length > 0 && (
          <div className="space-y-4">
             <div className="flex items-center gap-2 px-2">
                <ShieldCheck size={14} className="text-slate-400" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">系统核心字段 (Standard Fields)</h2>
             </div>
             <Card className="border-none shadow-xl shadow-slate-200/30 overflow-hidden rounded-3xl opacity-80 transition-opacity hover:opacity-100">
               <CardContent className="p-0">
                  <FieldTable fields={systemFields} onDelete={null} />
               </CardContent>
             </Card>
          </div>
        )}
      </div>

      {!isLoading && !fields.length && (
        <div className="py-24 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
          <Tag size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold">该对象尚未定义任何字段</p>
        </div>
      )}
    </div>
  );
}

function FieldTable({ fields, onDelete }: { fields: Field[]; onDelete: ((id: string) => void) | null }) {
  return (
    <Table>
      <TableHeader className="bg-slate-50/50">
        <TableRow>
          <TableHead className="py-3 px-6 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">字段显示标签</TableHead>
          <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">API 名称</TableHead>
          <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">数据类型</TableHead>
          <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">规则</TableHead>
          <TableHead className="py-3 font-bold text-slate-500 uppercase tracking-tighter text-[10px] text-right pr-10">创建日期</TableHead>
          {onDelete && <TableHead className="w-[60px]"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((f) => (
          <TableRow key={f.id} className="group transition-colors hover:bg-slate-50/50">
            <TableCell className="py-4 px-6 font-bold text-ink text-sm transition-colors group-hover:text-indigo-600">{f.label}</TableCell>
            <TableCell className="py-4 font-mono text-[11px] text-slate-400 uppercase tracking-tight">{f.apiName}</TableCell>
            <TableCell className="py-4 text-xs">
               <Badge variant="outline" className={cn("rounded-md border-none font-bold text-[10px] px-2 py-0", TYPE_STYLE[f.type] || "bg-slate-100 text-slate-500")}>
                 {TYPE_LABEL[f.type] ?? f.type}
               </Badge>
            </TableCell>
            <TableCell className="py-4">
               <div className="flex items-center gap-2">
                 {f.required && <Badge variant="secondary" className="bg-red-50 text-red-500 border-none font-bold text-[9px] px-1 h-4">必填</Badge>}
                 {f.unique && <Badge variant="secondary" className="bg-blue-50 text-blue-500 border-none font-bold text-[9px] px-1 h-4">唯一</Badge>}
                 {!f.required && !f.unique && <span className="text-slate-200 text-xs">—</span>}
               </div>
            </TableCell>
            <TableCell className="py-4 text-right pr-10 text-[11px] text-slate-400 font-medium">{fmtDate(f.createdAt)}</TableCell>
            {onDelete && (
              <TableCell className="py-4 pr-6">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  onClick={() => onDelete(f.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

