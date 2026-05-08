'use client';
// /knowledge/[id]/edit — Wave 20h
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '@/lib/api';
import { ArticleForm } from '@/components/knowledge/article-form';
import { Loader2 } from 'lucide-react';

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge', id, 'edit'],
    queryFn: () => knowledgeApi.get(id),
    enabled: !!id,
  });

  if (isLoading || !data) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-slate-300" />
      </div>
    );
  }

  return (
    <ArticleForm
      mode="edit"
      initial={{
        id: data.id,
        title: data.title ?? '',
        summary: data.summary ?? '',
        content: data.content ?? '',
        category: data.category ?? '',
        tags: data.tags ?? [],
        status: (data.status ?? 'draft') as 'draft' | 'published' | 'archived',
      }}
    />
  );
}
