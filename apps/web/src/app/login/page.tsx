'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [form, setForm] = useState({ tenantSlug: 'demo', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authApi.login(form.tenantSlug, form.email, form.password);
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo.png" alt="Tokenwave" className="w-12 h-12 rounded-xl shadow-lg shadow-brand/25" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tokenwave CRM</h1>
          <p className="mt-1 text-sm text-slate-500">登录您的工作区</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">工作区</label>
            <input
              className="input"
              value={form.tenantSlug}
              onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}
              placeholder="demo"
              required
            />
          </div>
          <div>
            <label className="label">邮箱</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@demo.com"
              required
            />
          </div>
          <div>
            <label className="label">密码</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          演示账号：admin@demo.com / Admin@1234
        </p>
      </div>
    </div>
  );
}
