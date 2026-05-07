'use client';
// ─── <LeadOutreachDrawer> ────────────────────────────────────────────────
// Modal that lets the SDR pick a channel + tone, generate an opener with
// AI, edit it inline, then copy to clipboard or open in their mail client.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, RefreshCw, Mail, MessageCircle, Phone,
  Copy, Check, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'wechat' | 'phone';
type Tone = 'professional' | 'friendly' | 'concise';

interface Draft {
  channel: Channel;
  subject: string;
  body: string;
  reasoning: string;
  modelName: string;
  source: 'live' | 'stub' | 'heuristic';
  latencyMs: number;
}

const CHANNELS: { value: Channel; label: string; icon: typeof Mail; color: string }[] = [
  { value: 'email',  label: '邮件', icon: Mail,          color: 'bg-brand text-white' },
  { value: 'wechat', label: '微信', icon: MessageCircle, color: 'bg-emerald-500 text-white' },
  { value: 'phone',  label: '电话', icon: Phone,         color: 'bg-amber-500 text-white' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: '正式专业' },
  { value: 'friendly',     label: '亲切友好' },
  { value: 'concise',      label: '极简直接' },
];

interface Props {
  leadId: string;
  leadEmail: string | null;
  leadFullName: string;
  open: boolean;
  onClose: () => void;
}

export function LeadOutreachDrawer({ leadId, leadEmail, leadFullName, open, onClose }: Props) {
  const [channel, setChannel] = useState<Channel>('email');
  const [tone, setTone] = useState<Tone>('professional');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);

  const generate = useMutation({
    mutationFn: () => aiApi.draftLeadOutreach(leadId, { channel, tone }) as Promise<Draft>,
    onSuccess: (d) => {
      setDraft(d);
      setEditedSubject(d.subject);
      setEditedBody(d.body);
    },
  });

  function handleCopy(text: string, kind: 'subject' | 'body') {
    navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  function openInMailClient() {
    if (!leadEmail) return;
    const url = `mailto:${encodeURIComponent(leadEmail)}?subject=${encodeURIComponent(editedSubject)}&body=${encodeURIComponent(editedBody)}`;
    window.open(url, '_blank');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Sparkles size={17} />
            </div>
            AI 起草外联消息
            <span className="text-sm font-bold text-slate-400 ml-1">→ {leadFullName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Channel picker */}
          <div>
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 block">渠道</Label>
            <div className="flex gap-2">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const isActive = channel === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={cn(
                      'flex-1 h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all',
                      isActive
                        ? c.color + ' shadow-lg'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    <Icon size={16} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tone picker */}
          <div>
            <Label className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 block">语气</Label>
            <div className="flex gap-2">
              {TONES.map((t) => {
                const isActive = tone === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={cn(
                      'flex-1 h-10 rounded-xl font-bold text-sm transition-all',
                      isActive
                        ? 'bg-ink text-white shadow-md'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate button */}
          <Button
            type="button"
            className="w-full h-12 rounded-2xl font-black bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white gap-2 shadow-xl shadow-violet-200/50"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : draft ? <RefreshCw size={16} /> : <Sparkles size={16} />}
            {generate.isPending ? '正在生成…' : draft ? '重新生成' : 'AI 生成'}
          </Button>

          {/* Error */}
          {generate.error && (
            <div className="p-4 rounded-2xl bg-red-50 text-sm font-bold text-red-600">
              生成失败：{(generate.error as Error).message}
            </div>
          )}

          {/* Draft */}
          {draft && (
            <>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 flex-wrap">
                <Cpu size={10} />
                <span className="font-mono">{draft.modelName.replace('-stub', '')}</span>
                {draft.source !== 'live' && (
                  <Badge className="h-4 px-1.5 text-[10px] font-bold bg-amber-50 text-amber-700 border-none">
                    {draft.source === 'stub' ? '启发式' : '回退'}
                  </Badge>
                )}
                <span className="ml-auto">{draft.latencyMs} ms</span>
              </div>

              {/* Email subject */}
              {channel === 'email' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">标题</Label>
                    <button
                      type="button"
                      onClick={() => handleCopy(editedSubject, 'subject')}
                      className="text-xs font-bold text-violet-500 hover:text-violet-600 flex items-center gap-1"
                    >
                      {copied === 'subject' ? <Check size={12} /> : <Copy size={12} />}
                      {copied === 'subject' ? '已复制' : '复制'}
                    </button>
                  </div>
                  <Input
                    className="rounded-xl font-bold"
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                  />
                </div>
              )}

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    {channel === 'phone' ? '通话脚本' : '正文'}
                  </Label>
                  <button
                    type="button"
                    onClick={() => handleCopy(editedBody, 'body')}
                    className="text-xs font-bold text-violet-500 hover:text-violet-600 flex items-center gap-1"
                  >
                    {copied === 'body' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'body' ? '已复制' : '复制'}
                  </button>
                </div>
                <Textarea
                  className="rounded-2xl font-medium min-h-[180px] leading-relaxed"
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                />
              </div>

              {draft.reasoning && (
                <div className="p-3 rounded-xl bg-violet-50/60 text-xs font-bold text-violet-700 leading-relaxed">
                  <span className="text-violet-400 mr-1">为什么这样写：</span>
                  {draft.reasoning}
                </div>
              )}

              {/* Send buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl font-bold"
                  onClick={onClose}
                >
                  关闭
                </Button>
                {channel === 'email' && leadEmail && (
                  <Button
                    type="button"
                    className="flex-1 h-11 rounded-xl font-bold bg-brand hover:bg-brand-deep text-white gap-2"
                    onClick={openInMailClient}
                  >
                    <Mail size={14} />
                    用邮箱打开
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
