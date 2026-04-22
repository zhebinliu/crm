'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Users, Settings,
  Workflow, Shield, LogOut, ArrowLeft, LayoutDashboard, Database, Mail
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ADMIN_NAV: NavItem[] = [
  { label: '用户与权限', href: '/admin/users', icon: <Users size={18} /> },
  { label: '工作流自动化', href: '/admin/workflow', icon: <Workflow size={18} /> },
  { label: '流程审批', href: '/admin/approvals', icon: <Shield size={18} /> },
  { label: '审批流程配置', href: '/admin/approvals/process-config', icon: <LayoutDashboard size={18} /> },
  { label: '邮件模板', href: '/admin/email-templates', icon: <Mail size={18} /> },
  { label: '对象元数据', href: '/admin/metadata', icon: <Settings size={18} /> },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    const rt = useAuthStore.getState().refreshToken;
    if (rt) await authApi.logout(rt).catch(() => null);
    logout();
    router.replace('/login');
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-[var(--sidebar-w)] bg-[#0B0E14] border-r border-[#1C1F26] flex flex-col z-20 overflow-hidden shadow-2xl">
      {/* Branding */}
      <div className="flex items-center gap-3 px-6 h-16 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center shadow-lg shadow-brand/20">
          <Database size={16} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-white text-sm leading-none tracking-tight">词元波动</span>
          <span className="text-[10px] text-brand font-bold tracking-[0.2em] mt-1 opacity-80 uppercase text-xs uppercase tracking-wider font-semibold">ADMIN CENTER</span>
        </div>
      </div>

      <div className="px-4 mb-2">
        <Separator className="bg-[#1C1F26]" />
      </div>

      {/* Switch to Front Office */}
      <div className="px-4 py-4 shrink-0 transition-all duration-300">
        <Link href="/dashboard">
          <Button variant="ghost" className="w-full justify-start gap-2 bg-brand/5 text-brand hover:bg-brand/10 hover:text-brand border border-brand/20 h-10 px-3 text-xs font-semibold">
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            返回业务前台
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        <div className="space-y-1.5">
          <div className="px-2 pb-2">
            <span className="text-[10px] font-bold text-[#4B4E56] uppercase tracking-widest">系统管理</span>
          </div>
          {ADMIN_NAV.map((item) => (
            <AdminNavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* User Session */}
      <div className="mt-auto p-4">
        <div className="bg-[#161921] rounded-2xl p-4 border border-[#1C1F26] shadow-inner">
          <div className="flex items-center gap-3">
             <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-[#232730] flex items-center justify-center text-brand font-bold border border-[#2D323C]">
                  {user?.displayName?.[0] ?? '?'}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-[#161921]" />
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate leading-tight">{user?.displayName}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-brand" />
                  <p className="text-[10px] text-[#4B4E56] truncate font-medium">管理员权限</p>
                </div>
             </div>
             <button onClick={handleLogout} className="group p-2 rounded-lg hover:bg-red-500/10 text-[#4B4E56] hover:text-red-500 transition-all duration-200">
                <LogOut size={16} />
             </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function AdminNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href + '/'));
  
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 border border-transparent',
        active
          ? 'bg-gradient-to-r from-brand/10 to-brand/5 text-brand border-brand/10 shadow-sm'
          : 'text-[#8A8D98] hover:bg-[#161921] hover:text-white hover:border-[#1C1F26]',
      )}
    >
      <span className={cn(
        'transition-colors duration-200',
        active ? 'text-brand' : 'text-[#4B4E56] group-hover:text-white'
      )}>
        {item.icon}
      </span>
      {item.label}
      {active && (
        <div className="ml-auto w-1 h-4 rounded-full bg-brand shadow-[0_0_8px_rgba(255,141,26,0.5)]" />
      )}
    </Link>
  );
}
