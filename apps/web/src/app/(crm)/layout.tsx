'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useSidebar, SidebarProvider } from '@/components/layout/sidebar-context';
import { useAuthStore } from '@/stores/auth';

function CrmLayoutContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const router = useRouter();
  const { collapsed } = useSidebar();

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className="flex-1 min-h-screen overflow-x-hidden transition-all duration-300"
        style={{ marginLeft: collapsed ? '64px' : 'var(--sidebar-w)' }}
      >
        {children}
      </main>
    </div>
  );
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <CrmLayoutContent>{children}</CrmLayoutContent>
    </SidebarProvider>
  );
}
