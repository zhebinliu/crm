'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { genericApi } from '@/lib/api';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RelatedSelectProps {
  value?: string;
  relatedTo: string;
  labelField?: string;
  placeholder?: string;
  onSelect: (id: string, label: string) => void;
  onClose: () => void;
}

export function RelatedSelect({
  value,
  relatedTo,
  labelField = 'name',
  placeholder,
  onSelect,
  onClose,
}: RelatedSelectProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['related', relatedTo, search],
    queryFn: () => genericApi.list(relatedTo, { search, take: 20 }),
  });

  const items = (data?.data ?? data ?? []) as Record<string, unknown>[];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 p-2"
    >
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder ?? `搜索${relatedTo}…`}
          className="h-8 pl-8 text-sm"
          autoFocus
        />
      </div>
      <div className="mt-1.5 max-h-48 overflow-y-auto space-y-0.5">
        {isLoading ? (
          <div className="py-4 text-center text-slate-400 text-xs">
            <Loader2 size={12} className="inline animate-spin mr-1" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="py-4 text-center text-slate-400 text-xs">无结果</div>
        ) : (
          items.map((item) => {
            const id = item.id as string;
            const label = (item[labelField] as string) ?? id;
            const isSelected = id === value;
            return (
              <button
                key={id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(id, label);
                }}
                className={cn(
                  'w-full text-left px-2.5 py-2 text-sm rounded-lg transition-colors',
                  isSelected
                    ? 'bg-brand text-white'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            );
          })
        )}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-slate-100">
        <Button
          variant="ghost"
          size="sm"
          onMouseDown={(e) => { e.preventDefault(); onClose(); }}
          className="w-full h-7 text-xs text-slate-400 hover:text-slate-600"
        >
          <X size={12} className="mr-1" /> 关闭
        </Button>
      </div>
    </div>
  );
}
