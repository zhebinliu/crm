'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Database, Tag, Layout as LayoutIcon, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ObjectAdminHeader({
  apiName,
  label,
}: {
  apiName: string;
  label?: string;
}) {
  const pathname = usePathname() ?? '';
  const tabs = [
    { href: `/admin/objects/${apiName}/record-types`, label: '记录类型', icon: <Tag size={13} /> },
    { href: `/admin/objects/${apiName}/page-layouts`, label: '页面布局', icon: <LayoutIcon size={13} /> },
    { href: `/admin/metadata/${apiName}`, label: '字段定义', icon: <Settings size={13} /> },
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/objects">
        <Button variant="ghost" size="sm" className="text-slate-500 hover:text-indigo-600 gap-2 mb-2 p-0 h-auto">
          <ArrowLeft size={14} /> 返回对象管理
        </Button>
      </Link>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-indigo-50 text-indigo-600 border-indigo-100">
            <Database size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink">{label ?? apiName}</h1>
            <p className="text-sm font-mono text-ink-secondary mt-1 tracking-tight">API NAME: {apiName.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-slate-100">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + '/');
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 -mb-px transition-colors',
                  active
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-slate-400 border-transparent hover:text-slate-700',
                )}
              >
                {t.icon} {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
