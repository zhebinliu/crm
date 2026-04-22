'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { genericApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Box, ChevronRight, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LookupSelectProps {
  objectApiName: string;
  value: string;
  onChange: (val: string) => void;
  label: string;
  placeholder?: string;
}

export function LookupSelect({ 
  objectApiName, 
  value, 
  onChange, 
  label,
  placeholder = "点击选择记录..." 
}: LookupSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // 1. Fetch Records for the reference object
  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['lookup', objectApiName, search],
    queryFn: () => genericApi.list(objectApiName, { search }),
  });

  const records = Array.isArray(recordsData?.data) ? recordsData.data : (Array.isArray(recordsData) ? recordsData : []);

  // 2. Fetch Selected Record Detail (to show name instead of ID)
  const { data: selectedRecord } = useQuery({
    queryKey: ['lookup-detail', objectApiName, value],
    queryFn: () => genericApi.get(objectApiName, value),
    enabled: !!value,
  });

  const displayValue = selectedRecord?.name || selectedRecord?.title || selectedRecord?.fullName || value || placeholder;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-1 items-center">
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            className={cn(
              "flex-1 justify-start text-left font-bold h-10 rounded-xl border-slate-200 shadow-sm hover:bg-slate-50 transition-all",
              !value && "text-slate-400"
            )}
          >
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-indigo-600" />
            <span className="truncate">{displayValue}</span>
          </Button>
        </DialogTrigger>
        {value && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 text-slate-300 hover:text-red-500 rounded-xl"
            onClick={() => onChange('')}
          >
            <Box size={16} className="rotate-45" />
          </Button>
        )}
      </div>
      <DialogContent className="sm:max-w-[500px] p-0 border-none shadow-2xl overflow-hidden rounded-3xl">
        <DialogHeader className="p-6 pb-2 border-b border-slate-50">
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Box size={20} className="text-indigo-600" /> 选择 {label}
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-4 bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={`搜索 ${label}...`} 
              className="pl-10 h-11 bg-white border-none shadow-sm rounded-xl font-bold"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2 pb-6">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 font-bold animate-pulse text-xs uppercase tracking-widest">
              正在解构相关实体...
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center text-slate-300 italic">
              未找到匹配的记录
            </div>
          ) : (
            <div className="space-y-1 px-1">
              {records.map((r: any) => (
                <button
                  key={r.id}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all text-left group"
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-colors shadow-sm">
                       {objectApiName === 'Contact' ? <User size={18} /> : <Building2 size={18} />}
                    </div>
                    <div>
                      <p className="font-bold text-ink">{r.name || r.title || r.fullName || "未命名记录"}</p>
                      <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{r.id.slice(-8)}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-200 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
