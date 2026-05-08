'use client';
// /knowledge/new — Wave 20h
import { ArticleForm } from '@/components/knowledge/article-form';

export default function NewArticlePage() {
  return (
    <ArticleForm
      mode="create"
      initial={{
        title: '',
        summary: '',
        content: '',
        category: '',
        tags: [],
        status: 'draft',
      }}
    />
  );
}
