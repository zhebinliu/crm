import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: string | Date | null | undefined, fmt = 'YYYY-MM-DD') {
  if (!d) return '—';
  return dayjs(d).format(fmt);
}

export function fmtMoney(val: number | string | null | undefined, currency = 'CNY') {
  if (val == null || val === '') return '—';
  const n = Number(val);
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return '—';
  return dayjs(d).fromNow();
}

// ── DS semantic badge classes ───────────────────────────────────────────────

export function stageColor(stage: string): string {
  const map: Record<string, string> = {
    prospecting:       'badge badge-gray',
    qualification:     'badge badge-blue',
    needs_analysis:    'badge badge-blue',
    value_proposition: 'badge badge-purple',
    proposal:          'badge badge-amber',
    negotiation:       'badge badge-orange',
    closed_won:        'badge badge-green',
    closed_lost:       'badge badge-red',
  };
  return map[stage] ?? 'badge badge-gray';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    // Lead status
    new:          'badge badge-blue',
    working:      'badge badge-amber',
    nurturing:    'badge badge-purple',
    qualified:    'badge badge-green',
    unqualified:  'badge badge-red',
    // Quote / approval
    draft:        'badge badge-gray',
    in_review:    'badge badge-amber',
    approved:     'badge badge-green',
    presented:    'badge badge-blue',
    accepted:     'badge badge-green',
    rejected:     'badge badge-red',
    expired:      'badge badge-gray',
    // Order / Contract
    activated:    'badge badge-green',
    shipped:      'badge badge-blue',
    delivered:    'badge badge-green',
    cancelled:    'badge badge-red',
    terminated:   'badge badge-red',
    pending:      'badge badge-amber',
    // Misc
    active:       'badge badge-green',
    inactive:     'badge badge-gray',
  };
  return map[status] ?? 'badge badge-gray';
}

export function ratingColor(rating: string): string {
  const map: Record<string, string> = {
    hot:  'badge badge-red',
    warm: 'badge badge-amber',
    cold: 'badge badge-blue',
  };
  return map[rating] ?? 'badge badge-gray';
}
