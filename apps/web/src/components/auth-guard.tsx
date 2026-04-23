'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const PUBLIC_PATHS = ['/login', '/'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser, setTokens } = useAuthStore();
  const [rehydrated, setRehydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('tw-auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state?.user) setUser(parsed.state.user);
        if (parsed.state?.accessToken) setTokens(parsed.state.accessToken, parsed.state.refreshToken || '');
      } catch {}
    }
    setRehydrated(true);
  }, []);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rehydrated) return;
    const path = window.location.pathname;
    const token = localStorage.getItem('tw_access_token');

    if (!token && !PUBLIC_PATHS.includes(path)) {
      router.replace('/login');
      return;
    }

    if (token && !user) {
      setLoading(true);
      authApi.me()
        .then((data) => setUser(data.user ?? data))
        .catch(() => {
          localStorage.removeItem('tw_access_token');
          localStorage.removeItem('tw_refresh_token');
          if (!PUBLIC_PATHS.includes(path)) router.replace('/login');
        })
        .finally(() => setLoading(false));
    }
  }, [rehydrated, user]);

  if (!rehydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="text-slate-400 font-medium">加载中…</div>
      </div>
    );
  }

  return <>{children}</>;
}
