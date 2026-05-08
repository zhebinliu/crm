'use client';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Database, Box, ShieldCheck, Tag, Layout as LayoutIcon, Layers } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ObjectDef {
  id: string;
  apiName: string;
  label: string;
  labelPlural: string;
  isSystem: boolean;
  isCustom: boolean;
}

export default function AdminObjectsIndexPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const objects: ObjectDef[] = data?.data ?? data ?? [];
  const standard = objects.filter((o) => o.isSystem);
  const custom = objects.filter((o) => o.isCustom).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="p-8 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
          <Layers size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink">对象管理</h1>
          <p className="text-sm text-ink-secondary mt-1">配置每个对象的记录类型与页面布局。</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-50 animate-pulse border border-slate-100" />
          ))}
        </div>
      )}

      {standard.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <ShieldCheck size={14} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">标准核心对象</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {standard.map((obj) => <ObjectAdminCard key={obj.id} obj={obj} />)}
          </div>
        </div>
      )}

      {custom.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Box size={14} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">自定义业务模块</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {custom.map((obj) => <ObjectAdminCard key={obj.id} obj={obj} />)}
          </div>
        </div>
      )}

      {!isLoading && !objects.length && (
        <div className="py-24 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
          <Database size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold">暂无对象定义</p>
        </div>
      )}
    </div>
  );
}

function ObjectAdminCard({ obj }: { obj: ObjectDef }) {
  return (
    <Card className="border-none shadow-md shadow-slate-100/50 hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300 rounded-3xl overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border',
            obj.isCustom
              ? 'bg-violet-50 text-violet-600 border-violet-100'
              : 'bg-indigo-50 text-indigo-600 border-indigo-100',
          )}>
            <Database size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <p className="font-bold text-ink truncate text-sm">{obj.label}</p>
              {obj.isCustom && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-200 text-violet-500 bg-violet-50 font-black uppercase tracking-tighter">CUSTOM</Badge>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{obj.apiName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
          <Link href={`/admin/objects/${obj.apiName}/record-types`} className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs font-bold transition-colors">
            <Tag size={12} /> 记录类型
          </Link>
          <Link href={`/admin/objects/${obj.apiName}/page-layouts`} className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs font-bold transition-colors">
            <LayoutIcon size={12} /> 页面布局
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
