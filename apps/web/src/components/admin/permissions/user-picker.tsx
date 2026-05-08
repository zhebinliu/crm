'use client';
// User search + pick widget used by Profile / Permission Set assignment modals.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Loader2, Search, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
}

export function UserPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, user: UserRow | null) => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery<UserRow[]>({
    queryKey: ['admin-users-picker', q],
    queryFn: () => adminApi.listUsers({ search: q || undefined }),
    staleTime: 15_000,
  });
  const rows = useMemo(() => (data ?? []).slice(0, 30), [data]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="按姓名 / 邮箱搜索"
          className="h-9 pl-9 rounded-xl"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-100 bg-white">
        {isLoading ? (
          <div className="p-6 text-center">
            <Loader2 size={16} className="animate-spin mx-auto text-slate-300" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm font-bold text-slate-400">没有匹配用户</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((u) => {
              const selected = value === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onChange(selected ? null : u.id, selected ? null : u)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left',
                      selected ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60',
                    )}
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600">
                      {u.displayName?.[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-ink truncate">{u.displayName}</div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                    </div>
                    {selected && <Check size={16} className="text-emerald-600" />}
                    {!u.isActive && (
                      <span className="text-[10px] px-1.5 h-4 rounded-full bg-slate-100 text-slate-500 font-bold inline-flex items-center">已禁用</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
