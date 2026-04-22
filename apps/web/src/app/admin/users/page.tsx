'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Plus, Search, RefreshCw, Pencil, Trash2, CheckCircle, XCircle, MoreVertical } from 'lucide-react';
import { UserFormModal } from './user-form-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface User {
  id: string;
  email: string;
  displayName: string;
  title?: string;
  department?: string;
  isActive: boolean;
  createdAt: string;
  roles: Array<{ role: { name: string; code: string } }>;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.listUsers({ search: search || undefined }),
  });

  const users: User[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.updateUser(id, { isActive: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">用户管理</h1>
          <p className="text-sm text-ink-secondary mt-1">管理系统全量用户及其权限角色分配。</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-brand hover:bg-brand-deep text-white shadow-lg shadow-brand/10">
          <Plus className="mr-2 h-4 w-4" /> 新建用户
        </Button>
      </div>

      {/* Filters & Content */}
      <Card className="border-none shadow-xl shadow-slate-200/40 bg-white/70 backdrop-blur-md overflow-hidden">
        <CardHeader className="border-b border-slate-50 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                placeholder="搜索姓名、邮箱…"
                className="pl-10 h-10 border-slate-200 bg-white/50 focus-visible:ring-brand"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ['admin-users'] })} className="h-10 w-10">
              <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold text-slate-500 py-3">用户信息</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">职位 / 部门</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">所属角色</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">状态</TableHead>
                <TableHead className="font-bold text-slate-500 py-3">创建时间</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                    正在加载用户数据...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                    暂无符合匹配的用户记录
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className="group transition-colors hover:bg-slate-50/50">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 text-sm font-bold border border-brand-100 uppercase">
                          {u.displayName?.[0] ?? '?'}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink text-sm">{u.displayName}</span>
                          <span className="text-xs text-ink-secondary">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-secondary text-sm">
                      <div className="flex flex-col">
                        <span>{u.title || "—"}</span>
                        <span className="text-[11px] text-slate-400">{u.department}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles?.map((r) => (
                          <Badge key={r.role.code} variant="secondary" className="bg-orange-50 text-orange-600 border-none font-medium px-2 py-0">
                            {r.role.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1.5 py-0.5 px-2.5 border-none ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {u.isActive ? '活跃' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">
                      {fmtDate(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical size={16} className="text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={() => setEditUser(u)} className="cursor-pointer gap-2">
                             <Pencil size={14} /> 编辑用户
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => { if (confirm(`确认停用用户 ${u.displayName}？`)) deleteMutation.mutate(u.id); }}
                            className="text-danger focus:text-danger cursor-pointer gap-2"
                          >
                             <Trash2 size={14} /> 停用
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modals */}
      {showCreate && <UserFormModal onClose={() => setShowCreate(false)} />}
      {editUser && <UserFormModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}

