import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  hasPermission: (code: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
        if (typeof window !== 'undefined') {
          localStorage.setItem('tw_access_token', accessToken);
          localStorage.setItem('tw_refresh_token', refreshToken);
        }
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tw_access_token');
          localStorage.removeItem('tw_refresh_token');
        }
      },
      hasPermission: (code) => {
        const { user } = get();
        if (!user) return false;
        if (user.permissions.includes('admin.*')) return true;
        if (user.permissions.includes(code)) return true;
        const [obj] = code.split('.');
        return user.permissions.includes(`${obj}.*`);
      },
    }),
    { name: 'tw-auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }) },
  ),
);
