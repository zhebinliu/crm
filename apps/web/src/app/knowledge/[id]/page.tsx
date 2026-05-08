'use client';
// ─── /knowledge/[id] ─────────────────────────────────────────────────────
// Article read view — auto-tracks /view, lets reader rate, owners edit.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { fmtDate, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, BookOpen, Loader2, ThumbsUp, ThumbsDown,
  Edit3, Eye, Send, Archive, RotateCcw,
} from 'lucide-react';

interface Article {
  id: string;
  articleNumber: string;
  title: string;
  summary: string | null;
  content: string;
  category: string | null;
  tags: string[];
  status: string;
  version: number;
  ownerId: string | null;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-500 text-white',
  draft: 'bg-amber-500 text-white',
  archived: 'bg-slate-400 text-white',
};

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading, error } = useQuery<Article>({
    queryKey: ['knowledge', id],
    queryFn: () => knowledgeApi.get(id),
    enabled: !!id,
  });

  // Implicit /view on mount
  useEffect(() => {
    if (!id) return;
    knowledgeApi.view(id).catch(() => null);
  }, [id]);

  const helpfulMut = useMutation({
    mutationFn: () => knowledgeApi.helpful(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', id] }),
  });
  const notHelpfulMut = useMutation({
    mutationFn: () => knowledgeApi.notHelpful(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', id] }),
  });
  const publishMut = useMutation({
    mutationFn: () => knowledgeApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', id] }),
  });
  const archiveMut = useMutation({
    mutationFn: () => knowledgeApi.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', id] }),
  });
  const revertMut = useMutation({
    mutationFn: () => knowledgeApi.revertToDraft(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', id] }),
  });

  const isAdmin = user?.roles?.includes('admin') ?? false;
  const isOwner = !!data?.ownerId && data.ownerId === user?.id;
  const canEdit = isAdmin || isOwner;

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-12 text-center">
        <p className="text-base font-black text-rose-500">加载失败</p>
        <Link href="/knowledge" className="text-sm text-brand mt-2 inline-block">
          返回列表
        </Link>
      </div>
    );
  }

  const status = data.status;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-sm font-bold text-slate-500 hover:text-ink inline-flex items-center gap-1.5"
      >
        <ArrowLeft size={14} /> 返回知识库
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Article body */}
        <div className="space-y-5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-black text-slate-400 px-1.5 py-0.5 rounded bg-slate-50">
              {data.articleNumber}
            </span>
            <span className={cn(
              'text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider',
              STATUS_BADGE[status] ?? STATUS_BADGE.draft,
            )}>
              {status === 'published' ? '已发布' : status === 'archived' ? '已归档' : '草稿'}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              v{data.version}
            </span>
            {data.publishedAt && (
              <span className="text-[10px] font-bold text-slate-400">
                · 发布于 {fmtDate(data.publishedAt, 'YYYY-MM-DD')}
              </span>
            )}
            {data.category && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                {data.category}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black text-ink tracking-tight leading-tight">
            {data.title}
          </h1>

          {data.summary && (
            <p className="text-base text-slate-600 font-medium leading-relaxed border-l-2 border-brand/30 pl-4">
              {data.summary}
            </p>
          )}

          {data.tags && data.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {data.tags.map((t) => (
                <span key={t} className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-8 prose prose-slate max-w-none prose-headings:font-black prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-pre:bg-slate-900 prose-code:text-rose-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-brand">
              <ReactMarkdown>{data.content}</ReactMarkdown>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  这篇文章对您有帮助吗？
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 rounded-xl font-bold gap-2 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    onClick={() => helpfulMut.mutate()}
                    disabled={helpfulMut.isPending}
                  >
                    <ThumbsUp size={14} /> {data.helpfulCount}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-10 rounded-xl font-bold gap-2 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => notHelpfulMut.mutate()}
                    disabled={notHelpfulMut.isPending}
                  >
                    <ThumbsDown size={14} /> {data.notHelpfulCount}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-bold text-slate-400 border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1">
                  <Eye size={12} /> {data.viewCount} 次阅读
                </span>
                <span>更新于 {fmtDate(data.updatedAt, 'YYYY-MM-DD')}</span>
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
              <CardContent className="p-5 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  作者操作
                </p>
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-xl font-bold gap-2"
                  onClick={() => router.push(`/knowledge/${id}/edit`)}
                >
                  <Edit3 size={14} /> 编辑
                </Button>
                {status === 'draft' && (
                  <Button
                    className="w-full h-10 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    onClick={() => publishMut.mutate()}
                    disabled={publishMut.isPending}
                  >
                    <Send size={14} /> 发布
                  </Button>
                )}
                {status === 'published' && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full h-10 rounded-xl font-bold gap-2"
                      onClick={() => revertMut.mutate()}
                      disabled={revertMut.isPending}
                    >
                      <RotateCcw size={14} /> 转为草稿
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full h-10 rounded-xl font-bold gap-2 hover:border-slate-400 hover:bg-slate-50"
                      onClick={() => archiveMut.mutate()}
                      disabled={archiveMut.isPending}
                    >
                      <Archive size={14} /> 归档
                    </Button>
                  </>
                )}
                {status === 'archived' && (
                  <Button
                    className="w-full h-10 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    onClick={() => publishMut.mutate()}
                    disabled={publishMut.isPending}
                  >
                    <Send size={14} /> 重新发布
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warnings for icons reserved for callouts
void BookOpen;
