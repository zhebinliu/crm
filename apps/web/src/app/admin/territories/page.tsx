'use client';
// ─── /admin/territories ──────────────────────────────────────────────────
// SF-style territory hierarchy admin (Wave 19f / 20f).
//
// Tree sidebar on the left (recursive, depth up to 16) with search and
// quick "+ 新建领地" / "运行所有规则" buttons up top. Clicking a node
// navigates to /admin/territories/:id where the detail panel lives.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { territoryApi, adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  MapPin, Search, Loader2, Plus, RefreshCw, ChevronRight, ChevronDown,
  AlertCircle, Play, Layers,
} from 'lucide-react';

interface TerritoryRow {
  id: string;
  apiName: string;
  label: string;
  description: string | null;
  parentId: string | null;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number; accounts: number; rules: number; children: number };
}

interface TreeNode extends TerritoryRow {
  children: TreeNode[];
}

const TYPE_ZH: Record<string, string> = {
  geographic: '地理',
  industry: '行业',
  named_account: '指定账号',
  other: '其他',
};

function buildTree(rows: TerritoryRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const lower = q.toLowerCase();
  const walk = (n: TreeNode): TreeNode | null => {
    const selfMatch =
      n.label.toLowerCase().includes(lower) ||
      n.apiName.toLowerCase().includes(lower);
    const filteredChildren = n.children
      .map(walk)
      .filter((x): x is TreeNode => x !== null);
    if (selfMatch || filteredChildren.length > 0) {
      return { ...n, children: filteredChildren };
    }
    return null;
  };
  return nodes.map(walk).filter((x): x is TreeNode => x !== null);
}

export default function TerritoryListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmRunOpen, setConfirmRunOpen] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery<TerritoryRow[]>({
    queryKey: ['territories'],
    queryFn: () => territoryApi.list(),
    staleTime: 15_000,
  });

  const rows = data ?? [];
  const tree = useMemo(() => buildTree(rows), [rows]);
  const visibleTree = useMemo(() => filterTree(tree, search.trim()), [tree, search]);

  const runAll = useMutation({
    mutationFn: () => territoryApi.runAllRules(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territories'] });
      setConfirmRunOpen(false);
    },
  });

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <MapPin size={20} />
            </div>
            领地管理
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            层级化领地 (Territory) — 成员 / 账号分配 / 自动分配规则。最多 16 层。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => setConfirmRunOpen(true)}
          >
            <Play size={14} />
            运行所有规则
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          <Button
            className="h-11 rounded-xl font-bold gap-2 bg-ink hover:bg-slate-800 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
            新建领地
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索领地名称 / apiName"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            {search && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl font-bold"
                onClick={() => setSearch('')}
              >
                重置
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tree */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle size={28} className="mx-auto text-red-300 mb-3" />
              <p className="text-base font-black text-red-500">加载失败：{(error as Error).message}</p>
            </div>
          ) : visibleTree.length === 0 ? (
            <div className="p-16 text-center">
              <Layers size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-base font-black text-slate-400">
                {search ? '没有匹配的领地' : '尚未创建任何领地'}
              </p>
              {!search && (
                <Button
                  className="mt-4 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> 新建领地
                </Button>
              )}
            </div>
          ) : (
            <div className="p-3">
              {visibleTree.map((node) => (
                <TerritoryNode key={node.id} node={node} depth={0} onPick={(id) => router.push(`/admin/territories/${id}`)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTerritoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={rows}
      />

      <Dialog open={confirmRunOpen} onOpenChange={setConfirmRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Play size={18} className="text-emerald-600" />
              运行所有分配规则
            </DialogTitle>
            <DialogDescription>
              对所有账号重新运行所有领地的自动分配规则。手动分配 (manual) 不会被移除，但
              auto / inherited 类型的归属将被重新计算。该操作不可中途撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmRunOpen(false)}>
              取消
            </Button>
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
              onClick={() => runAll.mutate()}
              disabled={runAll.isPending}
            >
              {runAll.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              确认运行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Recursive tree node ─────────────────────────────────────────────────

function TerritoryNode({
  node, depth, onPick,
}: { node: TreeNode; depth: number; onPick: (id: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        onClick={() => onPick(node.id)}
        className={cn(
          'group flex items-center gap-2 py-2 px-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors',
        )}
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((b) => !b);
            }}
            className="w-5 h-5 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            node.isActive ? 'bg-emerald-500' : 'bg-slate-300',
          )}
        />
        <span className="text-sm font-bold text-ink truncate">{node.label}</span>
        <span className="text-[11px] font-mono text-slate-400 truncate">{node.apiName}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <span className="px-1.5 h-4 rounded-full bg-slate-100 inline-flex items-center">
            {TYPE_ZH[node.type] ?? node.type}
          </span>
          {node._count && (
            <>
              <span className="px-1.5 h-4 rounded-full bg-blue-50 text-blue-700 inline-flex items-center">
                成员 {node._count.members}
              </span>
              <span className="px-1.5 h-4 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center">
                账号 {node._count.accounts}
              </span>
              <span className="px-1.5 h-4 rounded-full bg-violet-50 text-violet-700 inline-flex items-center">
                规则 {node._count.rules}
              </span>
            </>
          )}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TerritoryNode key={c.id} node={c} depth={depth + 1} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create territory dialog ────────────────────────────────────────────

function CreateTerritoryDialog({
  open, onOpenChange, existing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  existing: TerritoryRow[];
}) {
  const qc = useQueryClient();
  const [apiName, setApiName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [type, setType] = useState<string>('geographic');

  function reset() {
    setApiName(''); setLabel(''); setDescription(''); setParentId(''); setType('geographic');
  }

  const create = useMutation({
    mutationFn: () =>
      territoryApi.create({
        apiName: apiName.trim(),
        label: label.trim(),
        description: description.trim() || undefined,
        parentId: parentId || null,
        type,
        isActive: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['territories'] });
      reset();
      onOpenChange(false);
    },
  });

  void adminApi; // silence unused

  return (
    <Dialog
      open={open}
      onOpenChange={(b) => {
        if (!b) reset();
        onOpenChange(b);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Plus size={18} /> 新建领地
          </DialogTitle>
          <DialogDescription>
            apiName 创建后不可修改；类型用于业务分类。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormRow label="名称">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="华东大区"
              className="h-9 rounded-lg"
            />
          </FormRow>
          <FormRow label="apiName">
            <Input
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              placeholder="east_china"
              className="h-9 rounded-lg font-mono"
            />
          </FormRow>
          <FormRow label="类型">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
            >
              <option value="geographic">地理</option>
              <option value="industry">行业</option>
              <option value="named_account">指定账号</option>
              <option value="other">其他</option>
            </select>
          </FormRow>
          <FormRow label="父领地">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm w-full font-medium"
            >
              <option value="">(无 — 顶级)</option>
              {existing.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.apiName})
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="描述">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="(可选)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full font-medium"
            />
          </FormRow>
          {create.error && (
            <p className="text-xs font-bold text-red-500">
              {(create.error as Error).message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="rounded-xl bg-ink hover:bg-slate-800 text-white font-bold gap-2"
            onClick={() => create.mutate()}
            disabled={create.isPending || !apiName.trim() || !label.trim()}
          >
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// silence unused import warning
void Link;
