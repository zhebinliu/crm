'use client';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Database, Plus, ChevronRight, Box, ShieldCheck, Cpu } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ObjectDef {
  id: string;
  apiName: string;
  label: string;
  labelPlural: string;
  isSystem: boolean;
  isCustom: boolean;
  _count?: { fields: number };
}

export default function AdminMetadataPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const objects: ObjectDef[] = data?.data ?? data ?? [];
  const standard = objects.filter((o) => o.isSystem);
  const custom = objects.filter((o) => o.isCustom).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="p-8 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
            <Cpu size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">数据字典与对象定义</h1>
            <p className="text-sm text-ink-secondary mt-1">管理底层模型、字段属性以及系统元数据架构。</p>
          </div>
        </div>
        <Button className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/20 h-11 px-6 font-bold rounded-xl" disabled>
          <Plus className="mr-2 h-4 w-4" /> 创建自定义对象
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
             <div key={i} className="h-24 rounded-2xl bg-slate-50 animate-pulse border border-slate-100" />
          ))}
        </div>
      )}

      {/* Standard Objects Section */}
      {standard.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <ShieldCheck size={14} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">标准核心对象</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {standard.map((obj) => (
              <ObjectCard key={obj.id} obj={obj} />
            ))}
          </div>
        </div>
      )}

      {/* Custom Objects Section */}
      {custom.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Box size={14} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">自定义业务模块</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {custom.map((obj) => (
              <ObjectCard key={obj.id} obj={obj} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !objects.length && (
        <div className="py-24 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
          <Database size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold">暂无对象定义信息</p>
        </div>
      )}
    </div>
  );
}

function ObjectCard({ obj }: { obj: ObjectDef }) {
  return (
    <Link href={`/admin/metadata/${obj.apiName}`}>
      <Card className="border-none shadow-md shadow-slate-100/50 hover:shadow-xl hover:shadow-indigo-100/50 group transition-all duration-300 rounded-3xl overflow-hidden cursor-pointer hover:translate-y-[-2px]">
        <CardContent className="p-5 flex items-center gap-4">
          <div className={cn(
            'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-colors',
            obj.isCustom 
              ? 'bg-violet-50 text-violet-600 border-violet-100 group-hover:bg-violet-600 group-hover:text-white' 
              : 'bg-indigo-50 text-indigo-600 border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white',
          )}>
            <Database size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
               <p className="font-bold text-ink truncate text-sm transition-colors group-hover:text-indigo-600">{obj.label}</p>
               {obj.isCustom && (
                 <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-200 text-violet-500 bg-violet-50 font-black uppercase tracking-tighter">CUSTOM</Badge>
               )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{obj.apiName}</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

