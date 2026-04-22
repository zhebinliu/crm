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

const FIELD_TYPES = [
  'TEXT', 'TEXTAREA', 'NUMBER', 'CURRENCY', 'PERCENT',
  'BOOLEAN', 'DATE', 'DATETIME', 'EMAIL', 'PHONE',
  'URL', 'PICKLIST', 'REFERENCE',
];

const TYPE_STYLE: Record<string, string> = {
  TEXT: 'bg-blue-50 text-blue-600 border-blue-100',
  TEXTAREA: 'bg-blue-50 text-blue-600 border-blue-100',
  NUMBER: 'bg-amber-50 text-amber-600 border-amber-100',
  CURRENCY: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  PERCENT: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  BOOLEAN: 'bg-violet-50 text-violet-600 border-violet-100',
  DATE: 'bg-slate-50 text-slate-500 border-slate-100',
  DATETIME: 'bg-slate-50 text-slate-500 border-slate-100',
  EMAIL: 'bg-pink-50 text-pink-600 border-pink-100',
  PHONE: 'bg-pink-50 text-pink-600 border-pink-100',
  PICKLIST: 'bg-orange-50 text-orange-600 border-orange-100',
  REFERENCE: 'bg-indigo-50 text-indigo-600 border-indigo-100',
};

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

export default function MetadataObjectPage() {
  const qc = useQueryClient();
  const params = useParams();
  const objectName = params.objectName as string;
  const [showAdd, setShowAdd] = useState(false);
  const [newField, setNewField] = useState({
    apiName: '', label: '', type: 'TEXT', required: false,
  });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-object', objectName],
    queryFn: () => adminApi.getObject(objectName),
  });

  const obj: ObjectDef | null = data?.data ?? data ?? null;
  const fields: Field[] = obj?.fields ?? [];
  const systemFields = fields.filter((f) => f.isSystem);
  const customFields = fields.filter((f) => f.isCustom).sort((a, b) => a.apiName.localeCompare(b.apiName));

  const createMutation = useMutation({
    mutationFn: (d: typeof newField) => adminApi.createField(objectName, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-object', objectName] });
      setShowAdd(false);
      setNewField({ apiName: '', label: '', type: 'TEXT', required: false });
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error?.message ?? (err as any)?.message;
      setError(msg ?? '创建失败');
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
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">API 名称 *</Label>
                <Input 
                  value={newField.apiName}
                  onChange={(e) => setNewField({ ...newField, apiName: e.target.value })}
                  placeholder="custom_field__c"
                  className="h-10 border-slate-200 uppercase font-mono text-xs" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">字段展示标签 *</Label>
                <Input 
                  value={newField.label}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="例如: 客户等级"
                  className="h-10 border-slate-200" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">数据类型</Label>
                <Select value={newField.type} onValueChange={(val) => setNewField({ ...newField, type: val })}>
                   <SelectTrigger className="h-10 border-slate-200">
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      {FIELD_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="text-xs font-bold">{t}</SelectItem>
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
            
            {error && (
              <div className="mt-6 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2 text-red-600 text-xs font-bold">
                 <Info size={14} /> {error}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-slate-50">
              <Button variant="ghost" onClick={() => { setShowAdd(false); setError(''); }} className="font-bold">取消</Button>
              <Button 
                disabled={createMutation.isPending}
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
                 {f.type}
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

