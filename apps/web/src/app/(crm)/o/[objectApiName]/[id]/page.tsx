'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, genericApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { 
  ArrowLeft, Edit3, Trash2, MoreHorizontal, 
  Layout, ListFilter, Activity as ActivityIcon,
  ChevronRight, Box, Clock, Building2, User, Users, Target, Package, FileText, ShoppingCart, Calendar
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DynamicRecordForm } from '@/components/dynamic/dynamic-form';
import { RelatedList } from '@/components/dynamic/related-list';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

export default function UniversalRecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const objectApiName = params.objectApiName as string;
  const recordId = params.id as string;

  const [activeTab, setActiveTab] = useState('details');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const getObjectIcon = (name: string, size = 28) => {
    const iconMap: Record<string, any> = {
      Account: <Building2 size={size} />,
      Contact: <User size={size} />,
      Lead: <Users size={size} />,
      Opportunity: <Target size={size} />,
      Product: <Package size={size} />,
      Quote: <FileText size={size} />,
      Order: <ShoppingCart size={size} />,
      Contract: <Box size={size} />,
      Activity: <Calendar size={size} />,
    };
    return iconMap[name] || <Box size={size} />;
  };

  // 1. Fetch Object Def (Current)
  const { data: metaResponse, isLoading: loadingMeta } = useQuery({
    queryKey: ['admin-object', objectApiName],
    queryFn: () => adminApi.getObject(objectApiName),
  });

  // 2. Fetch All Objects (to find potential related lists)
  const { data: allObjectsResponse } = useQuery({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  // 3. Fetch Record Data
  const { data: recordResponse, isLoading: loadingData } = useQuery({
    queryKey: [objectApiName.toLowerCase(), recordId],
    queryFn: () => genericApi.get(objectApiName, recordId),
  });

  const objDef = metaResponse?.data ?? metaResponse;
  const record = recordResponse?.data ?? recordResponse;
  const fields = objDef?.fields ?? [];
  const childRelationships = objDef?.childRelationships ?? [];

  // Identify Related Lists using metadata
  const relatedLists = childRelationships.map((rel: any) => ({
    apiName: rel.childObjectApiName,
    label: rel.childLabelPlural,
    lookupField: rel.lookupFieldApiName,
  }));

  // Determine highlight fields (first 4 system fields)
  const highlightFields = fields.filter((f: any) => f.isSystem).slice(0, 4);

  const deleteMutation = useMutation({
    mutationFn: () => genericApi.remove(objectApiName, recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase()] });
      router.push(`/o/${objectApiName}`);
    },
  });

  if (loadingMeta || loadingData) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="h-10 w-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold animate-pulse">正在同步云端数据...</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-20 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-ink">记录未找到</h2>
        <p className="text-slate-500">该记录可能已被删除或您没有访问权限。</p>
        <Button variant="outline" onClick={() => router.back()}>返回上一页</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* 1. Highlight Panel (Header) */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                {getObjectIcon(objectApiName)}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Link href={`/o/${objectApiName}`} className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest flex items-center gap-1">
                    <ArrowLeft size={12} /> {objDef?.label || objectApiName}
                  </Link>
                  <Badge variant="outline" className="text-[10px] h-4 bg-slate-50 text-slate-400 border-none">ID: {recordId.slice(-8).toUpperCase()}</Badge>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-ink">
                  {record.name || record.subject || record.title || "未命名记录"}
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
               <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                 <DialogTrigger asChild>
                   <Button variant="outline" className="rounded-xl font-bold h-10 px-6 border-slate-200">
                     编辑
                   </Button>
                 </DialogTrigger>
                 <DialogContent className="max-w-4xl p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                   <DialogHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
                     <DialogTitle className="text-2xl font-black tracking-tight">编辑 {objDef?.label || objectApiName}</DialogTitle>
                   </DialogHeader>
                   <div className="p-8 max-h-[70vh] overflow-y-auto">
                     <DynamicRecordForm 
                       objectApiName={objectApiName}
                       recordId={recordId}
                       initialData={record}
                       onSuccess={() => {
                         setIsEditModalOpen(false);
                         qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase(), recordId] });
                       }}
                       onCancel={() => setIsEditModalOpen(false)}
                     />
                   </div>
                 </DialogContent>
               </Dialog>

               <Button 
                 variant="outline" 
                 className="rounded-xl font-bold h-10 px-6 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600"
                 onClick={() => { if(confirm('确认永久删除此记录？')) deleteMutation.mutate(); }}
               >
                 删除
               </Button>
               <Separator orientation="vertical" className="h-6 mx-2" />
               <Button variant="ghost" size="icon" className="rounded-full w-10 h-10">
                 <MoreHorizontal size={20} />
               </Button>
            </div>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mt-8 pt-6 border-t border-slate-50">
             {highlightFields.map((f: any) => (
               <div key={f.apiName} className="space-y-1">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.label}</p>
                 <p className="text-sm font-bold text-ink truncate">
                   {f.type === 'DATE' || f.type === 'DATETIME' ? fmtDate(record[f.apiName]) : String(record[f.apiName] ?? '—')}
                 </p>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* 2. Main Content (Tabs) */}
      <div className="max-w-[1600px] mx-auto px-8 mt-8">
        <Tabs defaultValue="details" className="space-y-6" onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* Left/Middle Column (Main) */}
            <div className="flex-1 w-full space-y-6">
              <TabsList className="bg-white p-1 h-12 shadow-sm rounded-2xl border border-slate-100">
                <TabsTrigger value="related" className="rounded-xl px-6 font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600">
                  <ListFilter size={14} className="mr-2" /> 相关
                </TabsTrigger>
                <TabsTrigger value="details" className="rounded-xl px-6 font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600">
                  <Layout size={14} className="mr-2" /> 详细信息
                </TabsTrigger>
                <TabsTrigger value="activity" className="rounded-xl px-6 font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600">
                  <ActivityIcon size={14} className="mr-2" /> 活动流
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details">
                 <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
                   <CardHeader className="p-8 border-b border-slate-50">
                     <CardTitle className="text-xl font-black">记录详情</CardTitle>
                   </CardHeader>
                   <CardContent className="p-8">
                      <DynamicRecordForm 
                        objectApiName={objectApiName}
                        recordId={recordId}
                        initialData={record}
                        onSuccess={() => qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase(), recordId] })}
                        onCancel={() => {}}
                      />
                   </CardContent>
                 </Card>
              </TabsContent>

              <TabsContent value="related">
                 <div className="space-y-6">
                    {relatedLists.length === 0 ? (
                       <div className="p-12 text-center text-slate-300 italic font-medium bg-white rounded-3xl border border-dashed border-slate-200">
                          暂无定义的关联关系
                       </div>
                    ) : (
                       relatedLists.map((rel: any) => (
                         <RelatedList 
                           key={rel.apiName}
                           childObjectApiName={rel.apiName}
                           label={rel.label}
                           parentId={recordId}
                           parentFieldApiName={rel.lookupField} // Use the actual lookup field from metadata
                         />
                       ))
                    )}
                 </div>
              </TabsContent>

              <TabsContent value="activity">
                 <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
                   <CardHeader className="p-8 border-b border-slate-50">
                     <CardTitle className="text-xl font-black">活动记录</CardTitle>
                   </CardHeader>
                   <CardContent className="p-12 text-center text-slate-300 italic font-medium">
                     暂无相关的活动或历史记录
                   </CardContent>
                 </Card>
              </TabsContent>
            </div>

            {/* Right Column (Sidebar) */}
            <div className="w-full md:w-[320px] space-y-6">
               <Card className="border-none shadow-lg shadow-slate-200/40 rounded-3xl bg-white">
                 <CardHeader className="p-6 pb-2">
                   <CardTitle className="text-sm font-black uppercase text-slate-400 tracking-widest">系统摘要</CardTitle>
                 </CardHeader>
                 <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                          <Clock size={16} />
                       </div>
                       <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">创建于</p>
                          <p className="text-xs font-bold text-ink">{fmtDate(record.createdAt)}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                          <ActivityIcon size={16} />
                       </div>
                       <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">最后修改</p>
                          <p className="text-xs font-bold text-ink">{fmtDate(record.updatedAt)}</p>
                       </div>
                    </div>
                 </CardContent>
               </Card>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
