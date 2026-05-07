'use client';
// ─── <NotificationBell> ───────────────────────────────────────────────────
// Floating bell icon in the top-right of the (crm) layout. Polls every 60s
// for unread count and lets the user expand a dropdown with the latest 20
// notifications. Click on a notification deep-links to its target record.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import {
  Bell, Check, AlertOctagon, AlertTriangle, Info, CheckCircle2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  kind: string;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: Notification[];
  unreadCount: number;
}

const TARGET_HREF: Record<string, string> = {
  opportunity: '/opportunities',
  lead: '/leads',
  account: '/accounts',
  contact: '/contacts',
  activity: '/activities',
  quote: '/quotes',
  order: '/orders',
};

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<ListResponse>({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(false, 20),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div ref={popRef} className="fixed top-4 right-6 z-30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative w-10 h-10 rounded-full shadow-md border bg-white flex items-center justify-center',
          'hover:shadow-lg transition-all',
          unread > 0 ? 'border-rose-200 text-rose-600' : 'border-slate-200 text-slate-500',
        )}
        title={`${unread} 条未读`}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-ink">通知中心</h3>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                {unread > 0 ? `${unread} 条未读` : '已清空'}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-[11px] font-black text-violet-500 hover:text-violet-600 flex items-center gap-1"
              >
                <Check size={11} /> 全部已读
              </button>
            )}
          </div>

          <div className="max-h-[440px] overflow-y-auto custom-scrollbar">
            {items.length === 0 ? (
              <div className="p-12 text-center">
                <Bell size={24} className="mx-auto text-slate-200 mb-2" />
                <p className="text-sm font-bold text-slate-400">暂无通知</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notif={n}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notif, onClick,
}: { notif: Notification; onClick: () => void }) {
  const Icon =
    notif.level === 'CRITICAL' ? AlertOctagon
    : notif.level === 'WARNING' ? AlertTriangle
    : notif.level === 'SUCCESS' ? CheckCircle2
    : Info;
  const tint =
    notif.level === 'CRITICAL' ? 'text-red-500 bg-red-50'
    : notif.level === 'WARNING' ? 'text-amber-500 bg-amber-50'
    : notif.level === 'SUCCESS' ? 'text-emerald-500 bg-emerald-50'
    : 'text-violet-500 bg-violet-50';

  const href = notif.targetType && notif.targetId && TARGET_HREF[notif.targetType]
    ? `${TARGET_HREF[notif.targetType]}/${notif.targetId}`
    : null;

  const inner = (
    <div className={cn(
      'px-5 py-4 flex items-start gap-3 hover:bg-slate-50/50 transition-colors',
      !notif.readAt ? 'bg-violet-50/20' : '',
    )}>
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', tint)}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-snug', !notif.readAt ? 'font-black text-ink' : 'font-bold text-slate-600')}>
            {notif.title}
          </p>
          {!notif.readAt && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />}
        </div>
        {notif.body && (
          <p className="text-xs font-medium text-slate-500 mt-1 leading-relaxed line-clamp-2">{notif.body}</p>
        )}
        <p className="text-[10px] font-bold text-slate-400 mt-1.5">{fmtRelative(notif.createdAt)}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <li>
        <Link href={href} onClick={onClick} className="block">{inner}</Link>
      </li>
    );
  }
  return <li onClick={onClick}>{inner}</li>;
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return iso.slice(0, 10);
}
