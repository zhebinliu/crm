'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailTemplatesApi } from '@/lib/api';
import { Plus, Search, Mail, Tag, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_SUGGESTIONS = ['销售', '市场', '服务', '其他'];

const CATEGORY_COLORS: Record<string, string> = {
  销售: 'bg-blue-50 text-blue-700 border-blue-100',
  市场: 'bg-purple-50 text-purple-700 border-purple-100',
  服务: 'bg-green-50 text-green-700 border-green-100',
  其他: 'bg-slate-50 text-slate-600 border-slate-200',
};

function getCategoryColor(cat?: string) {
  if (!cat) return 'bg-slate-50 text-slate-500 border-slate-100';
  return CATEGORY_COLORS[cat] ?? 'bg-orange-50 text-orange-700 border-orange-100';
}

export default function EmailTemplatesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    category: '',
    isActive: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['email-templates', search],
    queryFn: () => emailTemplatesApi.list(search ? { search } : undefined),
  });

  const templates: EmailTemplate[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const createMutation = useMutation({
    mutationFn: (d: unknown) => emailTemplatesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      setIsCreating(false);
      setForm({ name: '', subject: '', body: '', category: '', isActive: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => emailTemplatesApi.update(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      setSelected(updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => emailTemplatesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      setSelected(null);
    },
  });

  function selectTemplate(t: EmailTemplate) {
    setIsCreating(false);
    setSelected(t);
    setForm({
      name: t.name,
      subject: t.subject,
      body: t.body,
      category: t.category ?? '',
      isActive: t.isActive,
    });
  }

  function startCreate() {
    setSelected(null);
    setIsCreating(true);
    setForm({ name: '', subject: '', body: '', category: '', isActive: true });
  }

  function handleSave() {
    const payload = {
      name: form.name,
      subject: form.subject,
      body: form.body,
      category: form.category || undefined,
      isActive: form.isActive,
    };
    if (isCreating) {
      createMutation.mutate(payload);
    } else if (selected) {
      updateMutation.mutate({ id: selected.id, data: payload });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const showEditor = isCreating || selected !== null;

  return (
    <div className="flex h-full gap-0">
      {/* Left panel — template list */}
      <div className="w-[30%] min-w-[260px] flex flex-col border-r border-slate-100 bg-white h-full">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
                <Mail size={16} className="text-brand" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-ink leading-none">邮件模板</h1>
                <p className="text-[10px] text-ink-muted mt-0.5">{templates.length} 个模板</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={startCreate}
              className="bg-brand hover:bg-brand-deep text-white h-8 px-3 text-xs font-semibold rounded-xl shadow-sm shadow-brand/20"
            >
              <Plus size={14} className="mr-1" />
              新建模板
            </Button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="搜索模板名称或主题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs rounded-xl border-slate-200 bg-slate-50 focus:bg-white"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">加载中…</div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Mail size={32} className="text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">暂无模板</p>
              <p className="text-xs text-slate-300 mt-1">点击「新建模板」开始创建</p>
            </div>
          ) : (
            templates.map((t) => {
              const isActive = selected?.id === t.id && !isCreating;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className={cn(
                    'w-full text-left px-3 py-3 rounded-xl border transition-all duration-150',
                    isActive
                      ? 'bg-brand/5 border-brand/15 shadow-sm'
                      : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('text-[13px] font-semibold truncate flex-1', isActive ? 'text-brand' : 'text-ink')}>
                      {t.name}
                    </span>
                    {t.category && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', getCategoryColor(t.category))}>
                        {t.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted truncate mt-1">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn('text-[10px] font-medium', t.isActive ? 'text-green-600' : 'text-slate-400')}>
                      {t.isActive ? '● 启用' : '○ 停用'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel — editor */}
      <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-y-auto">
        {!showEditor ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 rounded-2xl bg-brand/8 flex items-center justify-center mb-4">
              <Mail size={28} className="text-brand/40" />
            </div>
            <p className="text-base font-semibold text-slate-400">选择左侧模板或新建</p>
            <p className="text-sm text-slate-300 mt-1">在这里编辑模板内容</p>
          </div>
        ) : (
          <div className="flex-1 p-6">
            {/* Editor header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-bold text-ink">
                  {isCreating ? '新建邮件模板' : '编辑邮件模板'}
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  {isCreating ? '填写以下信息创建模板' : `上次更新: ${selected ? new Date(selected.updatedAt).toLocaleDateString('zh-CN') : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isCreating && selected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(selected.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 px-3 rounded-xl text-xs font-semibold"
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    删除
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || !form.name || !form.subject || !form.body}
                  className="bg-brand hover:bg-brand-deep text-white h-9 px-4 rounded-xl text-xs font-semibold shadow-sm shadow-brand/20"
                >
                  <Save size={14} className="mr-1.5" />
                  {isSaving ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
              {/* Template name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-ink-secondary">模板名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如：欢迎邮件模板"
                  className="h-10 rounded-xl border-slate-200 text-sm"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5 relative">
                <Label className="text-xs font-semibold text-ink-secondary">分类</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      onFocus={() => setShowCatSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCatSuggestions(false), 150)}
                      placeholder="选择或输入分类"
                      className="h-10 pl-8 rounded-xl border-slate-200 text-sm"
                    />
                    {showCatSuggestions && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-100 shadow-lg z-10 overflow-hidden">
                        {CATEGORY_SUGGESTIONS.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onMouseDown={() => setForm((f) => ({ ...f, category: cat }))}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"
                          >
                            <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium', getCategoryColor(cat))}>
                              {cat}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Shortcut badges */}
                  <div className="flex gap-1.5 flex-wrap">
                    {CATEGORY_SUGGESTIONS.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: cat }))}
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded-full border font-medium transition-all',
                          form.category === cat
                            ? getCategoryColor(cat) + ' ring-1 ring-current'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-ink-secondary">邮件主题 *</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="例如：感谢您联系词元波动 CRM"
                  className="h-10 rounded-xl border-slate-200 text-sm"
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-ink-secondary">邮件正文 *</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="在此输入邮件正文内容，支持使用 {{变量名}} 作为占位符..."
                  className="rounded-xl border-slate-200 text-sm resize-none leading-relaxed"
                  style={{ minHeight: '300px' }}
                />
                <p className="text-[10px] text-slate-400">可使用 {'{{contact_name}}'}, {'{{company_name}}'} 等占位符</p>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">状态</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">停用后此模板不会出现在发送列表中</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none',
                    form.isActive ? 'bg-brand' : 'bg-slate-200',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                      form.isActive ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
