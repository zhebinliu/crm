'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { useAuthStore } from '@/stores/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (!user.roles.includes('admin')) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!user || !user.roles.includes('admin')) return null;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 ml-[var(--sidebar-w)] min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
