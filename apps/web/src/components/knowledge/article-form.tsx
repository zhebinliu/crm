'use client';
// Shared editor used by /knowledge/new and /knowledge/[id]/edit.

import { useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { knowledgeApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save, X, Tag as TagIcon } from 'lucide-react';

export interface ArticleFormValues {
  id?: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
}

const STATUS_OPTIONS: Array<{ k: ArticleFormValues['status']; label: string }> = [
  { k: 'draft', label: '草稿' },
  { k: 'published', label: '已发布' },
  { k: 'archived', label: '已归档' },
];

export function ArticleForm({
  initial,
  mode,
}: {
  initial: ArticleFormValues;
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const [form, setForm] = useState<ArticleFormValues>(initial);
  const [tagInput, setTagInput] = useState('');

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        summary: form.summary || undefined,
        content: form.content,
        category: form.category || undefined,
        tags: form.tags,
        status: form.status,
      };
      if (mode === 'create') {
        return knowledgeApi.create(payload);
      }
      return knowledgeApi.update(form.id!, payload);
    },
    onSuccess: (data: { id: string }) => {
      router.push(`/knowledge/${data.id ?? form.id}`);
    },
  });

  function addTag(t: string) {
    const v = t.trim();
    if (!v || form.tags.includes(v)) return;
    setForm({ ...form, tags: [...form.tags, v] });
    setTagInput('');
  }

  function removeTag(t: string) {
    setForm({ ...form, tags: form.tags.filter((x) => x !== t) });
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
      removeTag(form.tags[form.tags.length - 1]);
    }
  }

  const canSave = !!form.title.trim() && !!form.content.trim() && !saveMut.isPending;

  return (
    <div className="p-8 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black text-ink">
          {mode === 'create' ? '新建知识库文章' : '编辑文章'}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl font-bold"
            onClick={() => router.back()}
          >
            取消
          </Button>
          <Button
            className="h-10 rounded-xl font-bold bg-ink hover:bg-slate-800 text-white gap-1.5"
            disabled={!canSave}
            onClick={() => saveMut.mutate()}
          >
            <Save size={14} />
            {saveMut.isPending ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      {saveMut.error && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold">
          保存失败：{(saveMut.error as Error).message}
        </div>
      )}

      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">标题 *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="一句话描述这个问题或解决方案"
              className="h-11 rounded-xl text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">摘要</Label>
            <Textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="简短描述（用于列表和搜索结果）"
              className="rounded-xl min-h-[72px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">分类</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="例如：账户 / 计费 / 技术支持"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">状态</Label>
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => setForm({ ...form, status: s.k })}
                    className={`flex-1 h-10 rounded-xl text-sm font-bold border transition-colors ${
                      form.status === s.k
                        ? 'border-ink bg-ink text-white'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">标签</Label>
            <div className="flex flex-wrap items-center gap-1.5 p-2 border border-slate-200 rounded-xl min-h-[42px]">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700"
                >
                  <TagIcon size={10} className="text-slate-400" />
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => addTag(tagInput)}
                placeholder={form.tags.length ? '' : '回车 / 逗号 添加标签'}
                className="flex-1 min-w-[120px] outline-none text-sm font-medium bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              内容 (Markdown) *
            </Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={'# 标题\n\n描述问题、复现步骤、解决方案…'}
              className="rounded-xl min-h-[420px] font-mono text-sm leading-relaxed"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
