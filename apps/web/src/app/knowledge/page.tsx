'use client';
// ─── /knowledge ──────────────────────────────────────────────────────────
// Knowledge Base — search + browse (Wave 20h)

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '@/lib/api';
import { fmtRelative, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  BookOpen, Search, Loader2, Plus, Eye, ThumbsUp, ThumbsDown,
} from 'lucide-react';

type Status = 'all' | 'published' | 'draft' | 'archived';

interface Article {
  id: string;
  articleNumber: string;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  status: string;
  version: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

const TAB_LABELS: Record<Status, string> = {
  all: '全部',
  published: '已发布',
  draft: '草稿',
  archived: '已归档',
};

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  draft: 'bg-amber-50 text-amber-700 border-amber-100',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
};

export default function KnowledgeListPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Status>('published');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const listQuery = useQuery<{ data: Article[]; total: number }>({
    queryKey: ['knowledge-list', tab],
    queryFn: () =>
      knowledgeApi.list({
        status: tab === 'all' ? undefined : tab,
        take: 100,
      }),
    enabled: !searchQuery,
    staleTime: 15_000,
  });

  const searchResults = useQuery<Article[]>({
    queryKey: ['knowledge-search', searchQuery],
    queryFn: () => knowledgeApi.search(searchQuery, 20),
    enabled: !!searchQuery,
    staleTime: 15_000,
  });

  const isSearchMode = !!searchQuery;
  const articles = isSearchMode
    ? (searchResults.data ?? [])
    : (listQuery.data?.data ?? []);
  const isLoading = isSearchMode ? searchResults.isLoading : listQuery.isLoading;

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  function resetSearch() {
    setSearchInput('');
    setSearchQuery('');
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
              <BookOpen size={20} />
            </div>
            知识库
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-2">
            为客服与客户提供可复用的解决方案文章 — 搜索 / 浏览 / 编辑 / 发布
          </p>
        </div>
        <Button
          className="h-11 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-2"
          onClick={() => router.push('/knowledge/new')}
        >
          <Plus size={14} /> 新建文章
        </Button>
      </div>

      {/* Search */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-5">
          <form onSubmit={applySearch} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                搜索 标题 / 摘要 / 内容
              </label>
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="例如：登录失败 / 退款流程"
                className="h-10 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-10 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-1.5">
              <Search size={14} /> 搜索
            </Button>
            {isSearchMode && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl font-bold"
                onClick={resetSearch}
              >
                重置
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Tabs */}
      {!isSearchMode && (
        <div className="flex items-center gap-1 border-b border-slate-100">
          {(Object.keys(TAB_LABELS) as Status[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px',
                tab === k
                  ? 'text-ink border-brand'
                  : 'text-slate-400 border-transparent hover:text-ink',
              )}
            >
              {TAB_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="p-12 text-center">
          <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-400 mt-2">加载中…</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="p-16 text-center">
          <BookOpen size={28} className="mx-auto text-slate-200 mb-3" />
          <p className="text-base font-black text-slate-400">
            {isSearchMode ? '没有匹配的文章' : '暂无文章'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/knowledge/${a.id}`}
              className="block"
            >
              <Card className="border border-slate-100 shadow-sm hover:shadow-lg hover:border-slate-200 transition-all rounded-2xl bg-white h-full">
                <CardContent className="p-5 flex flex-col gap-3 h-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-black text-slate-400 px-1.5 py-0.5 rounded bg-slate-50">
                      {a.articleNumber}
                    </span>
                    <span className={cn(
                      'text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider',
                      STATUS_BADGE[a.status] ?? STATUS_BADGE.draft,
                    )}>
                      {a.status === 'published' ? '已发布' : a.status === 'archived' ? '已归档' : '草稿'}
                    </span>
                    {a.category && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {a.category}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-black text-ink leading-snug line-clamp-2">
                    {a.title}
                  </h3>
                  {a.summary && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                      {a.summary}
                    </p>
                  )}
                  {a.tags && a.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.tags.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Eye size={10} />{a.viewCount}</span>
                      <span className="inline-flex items-center gap-1 text-emerald-500"><ThumbsUp size={10} />{a.helpfulCount}</span>
                      <span className="inline-flex items-center gap-1 text-rose-400"><ThumbsDown size={10} />{a.notHelpfulCount}</span>
                    </span>
                    <span>{fmtRelative(a.publishedAt ?? a.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
