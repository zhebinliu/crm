'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { genericApi, adminApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, List } from 'lucide-react';
import Link from 'next/link';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DynamicRecordForm } from './dynamic-form';

interface RelatedListProps {
  childObjectApiName: string;
  parentFieldApiName: string;
  parentId: string;
  label: string;
}

export function RelatedList({ 
  childObjectApiName, 
  parentFieldApiName, 
  parentId, 
  label 
}: RelatedListProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  
  // 1. Fetch Records
  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['related', childObjectApiName, parentId],
    queryFn: () => genericApi.list(childObjectApiName, { [parentFieldApiName]: parentId }),
  });

  // 2. Fetch Child Meta (to get columns)
  const { data: metaResponse } = useQuery({
    queryKey: ['admin-object', childObjectApiName],
    queryFn: () => adminApi.getObject(childObjectApiName),
  });

  const records = Array.isArray(recordsData?.data) ? recordsData.data : (Array.isArray(recordsData) ? recordsData : []);
  const objDef = metaResponse?.data ?? metaResponse;
  const fields = objDef?.fields || [];
  
  // Select first 4 fields for list (excluding standard id/createdAt if possible)
  const columns = fields.filter((f: any) => f.apiName !== 'id' && f.isSystem).slice(0, 4);

  return (
    <Card className="border-none shadow-lg shadow-slate-200/40 rounded-3xl overflow-hidden bg-white">
      <CardHeader className="flex flex-row items-center justify-between p-6 border-b border-slate-50">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
             <List size={16} />
           </div>
           <CardTitle className="text-base font-black">
             {label} <span className="text-slate-300 ml-1">({records.length})</span>
           </CardTitle>
        </div>
        
        <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="font-bold text-brand h-8 px-4 rounded-lg hover:bg-brand/5">
              <Plus size={14} className="mr-1" /> 新建
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
            <DialogHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
              <DialogTitle className="text-2xl font-black tracking-tight">新建 {objDef?.label || label}</DialogTitle>
            </DialogHeader>
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              <DynamicRecordForm 
                objectApiName={childObjectApiName}
                initialData={{ [parentFieldApiName]: parentId }}
                onSuccess={() => {
                  setIsNewModalOpen(false);
                  qc.invalidateQueries({ queryKey: ['related', childObjectApiName, parentId] });
                }}
                onCancel={() => setIsNewModalOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold animate-pulse uppercase tracking-widest">
              正在同步相关记录...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-slate-300 italic text-sm">
              暂无关联项目
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/30">
                <TableRow className="hover:bg-transparent border-none">
                  {columns.map((col: any) => (
                    <TableHead key={col.apiName} className="text-[10px] font-black uppercase text-slate-400 tracking-tighter h-10 px-6">
                      {col.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 6).map((record: any) => (
                  <TableRow 
                    key={record.id} 
                    className="group hover:bg-slate-50/50 border-slate-50 cursor-pointer" 
                    onClick={() => router.push(`/o/${childObjectApiName}/${record.id}`)}
                  >
                    {columns.map((col: any) => (
                      <TableCell key={col.apiName} className="py-4 px-6 text-sm font-bold text-ink/80">
                        {col.type === 'DATE' || col.type === 'DATETIME' 
                          ? fmtDate(record[col.apiName]) 
                          : String(record[col.apiName] ?? '—')}
                      </TableCell>
                    ))}
                    <TableCell className="py-4 pr-6 text-right">
                       <ChevronRight size={14} className="text-slate-200 group-hover:text-brand transition-colors" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {records.length > 6 && (
          <div className="p-4 border-t border-slate-50 text-center">
             <Button variant="ghost" size="sm" className="text-xs font-bold text-slate-400 hover:text-indigo-600">
               查看全部关联项 ({records.length})
             </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
