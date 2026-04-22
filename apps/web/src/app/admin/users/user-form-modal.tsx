'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface User {
  id?: string;
  email: string;
  displayName: string;
  phone?: string;
  title?: string;
  department?: string;
  isActive?: boolean;
  roles?: Array<{ role: { code: string } }>;
}

interface Role {
  id: string;
  code: string;
  name: string;
}

export function UserFormModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!user?.id;

  const [form, setForm] = useState({
    email: user?.email ?? '',
    password: '',
    displayName: user?.displayName ?? '',
    phone: user?.phone ?? '',
    title: user?.title ?? '',
    department: user?.department ?? '',
    roleCodes: user?.roles?.map((r) => r.role.code) ?? [] as string[],
  });
  const [error, setError] = useState('');

  const { data: rolesData } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminApi.listRoles(),
  });
  const roles: Role[] = rolesData?.data ?? rolesData ?? [];

  const mutation = useMutation({
    mutationFn: (d: typeof form) =>
      isEdit
        ? adminApi.updateUser(user!.id!, d)
        : adminApi.createUser(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.message;
      setError(msg ?? '操作失败');
    },
  });

  function toggleRole(code: string) {
    setForm((f) => ({
      ...f,
      roleCodes: f.roleCodes.includes(code)
        ? f.roleCodes.filter((c) => c !== code)
        : [...f.roleCodes, code],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate(form);
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50/50 border-b border-slate-100">
          <DialogTitle className="text-xl font-bold text-ink">
            {isEdit ? '编辑用户信息' : '新建系统用户'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-ink-secondary">邮箱地址 *</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@company.com"
                  className="h-10 border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-ink-secondary">初始密码 *</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="至少 8 位字符"
                  className="h-10 border-slate-200"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-ink-secondary">显示名称 *</Label>
            <Input
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="例如：张三"
              className="h-10 border-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-ink-secondary">联系电话</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+86..."
                className="h-10 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-ink-secondary">职位</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：销售主管"
                className="h-10 border-slate-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-ink-secondary">部门</Label>
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="例如：华东销售二部"
              className="h-10 border-slate-200"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-ink-secondary">分配角色权限</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r: Role) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => toggleRole(r.code)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 border ${
                    form.roleCodes.includes(r.code)
                      ? 'bg-brand text-white border-brand shadow-md shadow-brand/10'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand/40'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-100 p-3 text-sm text-red-600 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <div className="h-1.5 w-1.5 rounded-full bg-red-600" />
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending} className="text-slate-500">
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-brand hover:bg-brand-deep text-white px-8">
              {mutation.isPending ? '提交中...' : '确认保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

