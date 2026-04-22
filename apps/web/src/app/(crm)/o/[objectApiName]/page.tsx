'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, genericApi } from '@/lib/api';
import { Plus, Search, Filter, MoreHorizontal, FileEdit, Trash2, ArrowLeft, Eye, AlertCircle } from 'lucide-react';
import { DynamicRecordForm } from '@/components/dynamic/dynamic-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function UniversalObjectListPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const objectApiName = params.objectApiName as string;

  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Fetch Object Def (Meta)
  const { data: metaResponse, isLoading: loadingMeta } = useQuery({
    queryKey: ['admin-object', objectApiName],
    queryFn: () => adminApi.getObject(objectApiName),
  });

  // 2. Fetch Data Generic
  const { data: recordsData, isLoading: loadingData, isError: recordsError } = useQuery({
    queryKey: [objectApiName.toLowerCase()],
    queryFn: () => genericApi.list(objectApiName),
    retry: false,
  });

  const objDef = metaResponse?.data ?? metaResponse;
  const fields = objDef?.fields ?? [];
  const records = (recordsData?.data ?? recordsData ?? []) as Record<string, unknown>[];

  // Filter records based on search
  const filteredRecords = records.filter((r: any) => 
    Object.values(r).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Determine columns to show in list view (max 6)
  const columns = fields.length > 0
    ? fields.filter((f: any) => f.isSystem || f.isCustom).slice(0, 6)
    : Object.keys(records[0] ?? {}).filter(k => k !== 'id').slice(0, 6).map((k) => ({ id: k, label: k, apiName: k }));

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这条记录吗？')) {
      await genericApi.remove(objectApiName, id);
      qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase()] });
    }
  };

  const handleRowClick = (id: string) => {
    router.push(`/o/${objectApiName}/${id}`);
  };

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-ink-secondary mb-1">
            <Link href="/" className="hover:text-brand transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <span className="text-xs uppercase tracking-wider font-semibold">CRM 系统</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            {objDef ? objDef.label : objectApiName}
          </h1>
          <p className="text-sm text-ink-secondary">
            查看、搜索和管理您的 {objDef ? objDef.label : objectApiName} 数据。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="hidden sm:flex">
            <Filter className="mr-2 h-4 w-4" /> 筛选
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/20">
            <Plus className="mr-2 h-4 w-4" /> 新增记录
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden bg-white/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-50 flex flex-row items-center justify-between space-y-0 py-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="快速搜索..."
              className="pl-10 h-10 border-slate-200 focus-visible:ring-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-ink-secondary">
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none font-semibold">
              {filteredRecords.length} 条记录
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {recordsError ? (
              <div className="py-20 flex flex-col items-center justify-center text-red-400 gap-3">
                <AlertCircle size={40} className="text-red-300" />
                <div className="text-red-500 font-medium">加载失败，请刷新重试</div>
              </div>
            ) : (loadingMeta || loadingData) ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <div className="h-8 w-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">正在拉取数据...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                  <Search size={40} />
                </div>
                <div className="text-slate-500 font-medium">暂无数据</div>
                <p className="text-sm text-slate-400">点击右上角「新增记录」按钮创建</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    {columns.map((c: any) => (
                      <TableHead key={c.id} className="text-2xs uppercase tracking-widest font-bold text-slate-500 h-11">
                        {c.label}
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r: any) => (
                    <TableRow key={r.id} className="group hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => handleRowClick(r.id)}>
                      {columns.map((c: any) => (
                        <TableCell key={c.id} className="py-4 text-sm font-medium text-ink/80">
                          {c.type === 'BOOLEAN' ? (
                            <Badge variant={r[c.apiName] ? 'default' : 'outline'} className={`rounded-md ${r[c.apiName] ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}>
                              {r[c.apiName] ? '是' : '否'}
                            </Badge>
                          ) : (
                            String(r[c.apiName] ?? '—')
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                             <DropdownMenuItem onClick={() => handleRowClick(r.id)} className="cursor-pointer gap-2">
                              <Eye className="h-3.5 w-3.5" /> 详情
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRowClick(r.id)} className="cursor-pointer gap-2">
                              <FileEdit className="h-3.5 w-3.5" /> 编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(r.id)} className="cursor-pointer gap-2 text-danger focus:text-danger">
                              <Trash2 className="h-3.5 w-3.5" /> 删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Form Dialog (Mainly for Add New) */}
      <Dialog 
        open={showAdd} 
        onOpenChange={(open) => setShowAdd(open)}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold">
              新建 {objDef?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-2">
            <DynamicRecordForm
              objectApiName={objectApiName}
              onSuccess={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase()] }); }}
              onCancel={() => { setShowAdd(false); }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

