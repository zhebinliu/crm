'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Building2, UserCheck, TrendingUp,
  FileText, ShoppingCart, ScrollText, Settings,
  LogOut, Box, Sparkles, ChevronRight, UserPlus, CalendarCheck, BarChart3, PanelLeftClose, ChevronLeft, BarChart2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'next/navigation';
import { authApi, adminApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSidebar } from '@/components/layout/sidebar-context';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const { collapsed, setCollapsed } = useSidebar();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data: objectsResponse } = useQuery({
    queryKey: ['admin-objects'],
    queryFn: () => adminApi.listObjects(),
  });

  const objects = Array.isArray(objectsResponse?.data)
    ? objectsResponse.data
    : Array.isArray(objectsResponse)
    ? objectsResponse
    : [];

  const DEDICATED_PAGES: Record<string, { href: string; icon: React.ReactNode }> = {
    lead:        { href: '/leads',          icon: <UserPlus size={18} /> },
    account:     { href: '/accounts',       icon: <Building2 size={18} /> },
    contact:     { href: '/contacts',       icon: <UserCheck size={18} /> },
    opportunity: { href: '/opportunities',  icon: <TrendingUp size={18} /> },
    quote:       { href: '/quotes',         icon: <FileText size={18} /> },
    order:       { href: '/orders',        icon: <ShoppingCart size={18} /> },
    contract:    { href: '/contracts',      icon: <ScrollText size={18} /> },
    activity:    { href: '/activities',     icon: <CalendarCheck size={18} /> },
    report:      { href: '/reports',       icon: <BarChart3 size={18} /> },
  };

  const SYSTEM_OBJECTS = new Set([
    'User', 'Role', 'WorkflowRule', 'ValidationRule',
    'ApprovalProcess', 'ApprovalRequest', 'ApprovalProcessInstance',
    'EmailTemplate', 'EmailLog', 'WorkflowExecution', 'AuditLog',
  ]);

  const crmObjects = objects.filter(
    (obj: any) => !SYSTEM_OBJECTS.has(obj.apiName),
  );

  const sortedObjects = [...crmObjects].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return 0;
  });

  async function handleLogout() {
    const rt = useAuthStore.getState().refreshToken;
    if (rt) await authApi.logout(rt).catch(() => null);
    logout();
    router.replace('/login');
  }

  const isAdmin =
    user?.roles.includes('admin') ||
    user?.roles.some((r: any) => typeof r === 'object' && r.role.code === 'admin');

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed top-0 left-0 h-screen bg-white border-r border-slate-100 flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300',
          collapsed ? 'w-16' : 'w-[var(--sidebar-w)]',
        )}
      >
        {/* Branding + Collapse Toggle */}
        <div className={cn('flex items-center h-16 shrink-0', collapsed ? 'px-2 justify-center' : 'px-4 gap-3')}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center shadow-lg shadow-brand/20 shrink-0">
            <Sparkles size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-bold text-ink text-sm leading-none tracking-tight">词元波动</span>
              <span className="text-[10px] text-brand font-bold tracking-[0.2em] mt-1 opacity-80 uppercase leading-none">CRM 360</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand transition-all shrink-0"
            title={collapsed ? '展开菜单' : '收起菜单'}
          >
            {collapsed ? <ChevronLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <div className="px-4">
          <Separator className="bg-slate-50" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar space-y-4">
          {!collapsed && (
            <>
              {/* Main Group */}
              <NavGroup label="核心工作区" groupKey="core" collapsedGroups={collapsedGroups} onToggle={toggleGroup}>
                <NavLink item={{ label: '控制台主页', href: '/dashboard', icon: <LayoutDashboard size={18} /> }} pathname={pathname} />
                <NavLink item={{ label: '销售预测', href: '/forecasts', icon: <BarChart2 size={18} /> }} pathname={pathname} />
                <NavLink item={{ label: '报表与分析', href: '/reports', icon: <BarChart3 size={18} /> }} pathname={pathname} />
              </NavGroup>

              {/* CRM Objects Group */}
              <NavGroup label="业务模块" groupKey="crm" collapsedGroups={collapsedGroups} onToggle={toggleGroup}>
                {sortedObjects.map((obj: any) => {
                  const dedicated = DEDICATED_PAGES[obj.apiName];
                  return (
                    <NavLink
                      key={obj.apiName}
                      item={{
                        label: obj.labelPlural || obj.label,
                        href: dedicated ? dedicated.href : `/o/${obj.apiName}`,
                        icon: dedicated ? dedicated.icon : <Box size={18} />,
                      }}
                      pathname={pathname}
                    />
                  );
                })}
              </NavGroup>
            </>
          )}

                    {collapsed && (
            <div className="space-y-1 pt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/dashboard" className={cn('flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                    pathname === '/dashboard' ? 'bg-brand/5 text-brand' : 'text-slate-400 hover:bg-slate-50 hover:text-brand')}>
                    <LayoutDashboard size={18} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">控制台主页</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/forecasts" className={cn('flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                    pathname === '/forecasts' ? 'bg-brand/5 text-brand' : 'text-slate-400 hover:bg-slate-50 hover:text-brand')}>
                    <BarChart2 size={18} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">销售预测</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/reports" className={cn('flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                    pathname === '/reports' ? 'bg-brand/5 text-brand' : 'text-slate-400 hover:bg-slate-50 hover:text-brand')}>
                    <BarChart3 size={18} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">报表与分析</TooltipContent>
              </Tooltip>
              <Separator className="my-2 bg-slate-100" />
              {sortedObjects.map((obj: any) => {
                const dedicated = DEDICATED_PAGES[obj.apiName];
                const href = dedicated ? dedicated.href : `/o/${obj.apiName}`;
                return (
                  <Tooltip key={obj.apiName}>
                    <TooltipTrigger asChild>
                      <Link href={href} className={cn('flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                        pathname === href || pathname.startsWith(href + '/') ? 'bg-brand/5 text-brand' : 'text-slate-400 hover:bg-slate-50 hover:text-brand')}>
                        {dedicated ? dedicated.icon : <Box size={18} />}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{obj.labelPlural || obj.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Session */}
        <div className="mt-auto p-4">
          <div
            className={cn(
              'bg-slate-50/50 rounded-2xl p-3 border border-slate-100 transition-all duration-300',
              collapsed && 'p-2',
            )}
          >
            <div className={cn('flex items-center gap-3', collapsed && 'flex-col')}>
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-brand font-bold border border-slate-100 shadow-sm">
                  {user?.displayName?.[0] ?? '?'}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-white" />
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate leading-tight">{user?.displayName}</p>
                  <p className="text-[10px] text-ink-muted truncate font-medium mt-0.5">{user?.email}</p>
                </div>
              )}
              <div className={cn('flex items-center gap-1', collapsed && 'flex-col mt-1')}>
                {isAdmin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/admin/users">
                        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand transition-all duration-200" title="配置中心">
                          <Settings size={16} />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">配置中心</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLogout}
                      className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all duration-200"
                      title="退出登录"
                    >
                      <LogOut size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">退出登录</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function NavGroup({
  label,
  groupKey,
  collapsedGroups,
  onToggle,
  children,
}: {
  label: string;
  groupKey: string;
  collapsedGroups: Set<string>;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsedGroups.has(groupKey);

  return (
    <div>
      <button
        onClick={() => onToggle(groupKey)}
        className="w-full flex items-center justify-between px-3 pb-2 hover:text-brand transition-colors"
      >
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <ChevronRight
          size={12}
          className={cn(
            'text-slate-300 transition-transform duration-200',
            isCollapsed && '-rotate-90',
          )}
        />
      </button>
      <div className={cn('space-y-1', isCollapsed && 'hidden')}>{children}</div>
    </div>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: { label: string; href: string; icon: React.ReactNode };
  pathname: string;
}) {
  const active =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          className={cn(
            'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 border border-transparent',
            active
              ? 'bg-brand/5 text-brand border-brand/5 shadow-sm'
              : 'text-ink-secondary hover:bg-slate-50 hover:text-ink hover:border-slate-100',
          )}
        >
          <span
            className={cn(
              'transition-colors duration-200 shrink-0',
              active ? 'text-brand' : 'text-slate-400 group-hover:text-ink',
            )}
          >
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {active ? (
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,141,26,0.5)]" />
          ) : (
            <ChevronRight
              size={12}
              className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-200 text-slate-300"
            />
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
