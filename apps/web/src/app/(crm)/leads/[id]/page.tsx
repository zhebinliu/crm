'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { leadsApi } from '@/lib/api';
import { fmtDate, fmtMoney, fmtRelative, statusColor, ratingColor, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LeadFormModal } from '../lead-form-modal';
import { ConvertLeadModal } from './convert-lead-modal';
import { LeadScoreCard } from '@/components/ai/lead-score-card';
import { LeadOutreachDrawer } from '@/components/ai/lead-outreach-drawer';
import { CustomFieldsCard } from '@/components/dynamic/custom-fields-card';
import { InlineEditField } from '@/components/crm/inline-edit-field';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  GitMerge,
  Building2,
  Mail,
  Phone,
  Globe,
  BarChart2,
  Factory,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Sparkles,
} from 'lucide-react';

const STATUS_ZH: Record<string, string> = {
  new: '新建',
  working: '跟进中',
  nurturing: '培育中',
  qualified: '已认定',
  unqualified: '未认定',
};

const RATING_ZH: Record<string, string> = {
  hot: '热',
  warm: '暖',
  cold: '冷',
};

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id),
    enabled: !!id,
  });

  const removeMutation = useMutation({
    mutationFn: () => leadsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      router.push('/leads');
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6 max-w-[1400px] mx-auto animate-pulse">
        <div className="h-8 w-32 bg-slate-100 rounded-xl" />
        <div className="h-24 bg-slate-100 rounded-3xl" />
        <div className="grid grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle size={32} className="text-red-300" />
          </div>
          <p className="text-xl font-black text-slate-300">线索不存在</p>
          <p className="text-sm text-slate-400 mt-2 font-medium">该线索可能已被删除或您没有访问权限</p>
          <Button
            className="mt-6 rounded-xl font-bold bg-brand hover:bg-brand-deep text-white"
            onClick={() => router.push('/leads')}
          >
            返回线索列表
          </Button>
        </div>
      </div>
    );
  }

  function handleDelete() {
    const name = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || '该线索';
    if (confirm(`确定删除线索「${name}」吗？此操作不可撤销，所有相关数据将被永久删除。`)) {
      removeMutation.mutate();
    }
  }

  const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50/60 hover:bg-slate-100/50 transition-colors">
      <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <div className="text-sm font-bold text-ink">{value || <span className="text-slate-300 font-medium">未填写</span>}</div>
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Back Button */}
      <Button
        variant="ghost"
        className="h-9 px-3 rounded-xl font-bold text-slate-500 hover:text-ink hover:bg-slate-100 gap-2 -ml-1"
        onClick={() => router.push('/leads')}
      >
        <ArrowLeft size={16} />
        返回线索列表
      </Button>

      {/* Header Card */}
      <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand/20 to-brand-deep/10 flex items-center justify-center text-brand font-black text-3xl shrink-0">
              {(lead.firstName?.[0] ?? lead.lastName?.[0] ?? lead.company?.[0] ?? '?').toUpperCase()}
            </div>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-black text-ink tracking-tight">
                  {lead.firstName ?? ''} {lead.lastName ?? ''}
                  {!lead.firstName && !lead.lastName && (lead.company || '未命名线索')}
                </h1>
                {lead.status && (
                  <Badge
                    variant="outline"
                    className={cn('border-none font-bold', statusColor(lead.status))}
                  >
                    {STATUS_ZH[lead.status] ?? lead.status}
                  </Badge>
                )}
                {lead.rating && (
                  <Badge
                    variant="outline"
                    className={cn('border-none font-bold', ratingColor(lead.rating))}
                  >
                    {RATING_ZH[lead.rating] ?? lead.rating}
                  </Badge>
                )}
                {lead.isConverted && (
                  <Badge className="bg-emerald-50 text-emerald-600 border-none font-bold gap-1">
                    <CheckCircle2 size={12} />
                    已转化
                  </Badge>
                )}
              </div>
              {lead.company && (
                <p className="text-base text-slate-500 font-medium flex items-center gap-2">
                  <Building2 size={14} className="text-slate-400" />
                  {lead.company}
                  {lead.industry && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>{lead.industry}</span>
                    </>
                  )}
                </p>
              )}
              <p className="text-xs text-slate-400 font-medium mt-2 flex items-center gap-1.5">
                <Clock size={12} />
                创建于 {fmtDate(lead.createdAt, 'YYYY-MM-DD HH:mm')} · {fmtRelative(lead.createdAt)}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!lead.isConverted && (
                <Button
                  className="h-10 px-4 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg shadow-emerald-200/50"
                  onClick={() => setConvertOpen(true)}
                >
                  <GitMerge size={15} />
                  转化线索
                </Button>
              )}
              <Button
                className="h-10 px-4 rounded-xl font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white gap-2 shadow-lg shadow-violet-200/50"
                onClick={() => setOutreachOpen(true)}
              >
                <Sparkles size={15} />
                AI 起草外联
              </Button>
              <Button
                variant="outline"
                className="h-10 px-4 rounded-xl font-bold border-slate-200 gap-2"
                onClick={() => setEditOpen(true)}
              >
                <Edit2 size={15} />
                编辑
              </Button>
              <Button
                variant="outline"
                className="h-10 px-4 rounded-xl font-bold border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 gap-2"
                onClick={handleDelete}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? (
                  <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                删除
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Score (full width) */}
      <LeadScoreCard
        leadId={id}
        onScoreChanged={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })}
      />

      {/* Custom fields (admin-defined) */}
      <CustomFieldsCard
        objectApiName="lead"
        customFields={lead.customFields as Record<string, unknown> | null}
        saveFn={(patch) => leadsApi.update(id, patch)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })}
      />

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact & Company Info */}
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardHeader className="px-6 pt-6 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
                <Users size={16} className="text-brand" />
              </div>
              联系与公司
            </CardTitle>
          </CardHeader>
          <Separator className="bg-slate-50 mx-6" />
          <CardContent className="p-6 grid grid-cols-1 gap-3">
            <InfoRow
              icon={<Building2 size={15} />}
              label="公司"
              value={
                <InlineEditField
                  value={lead.company}
                  onSave={(v) => leadsApi.update(id, { company: v })}
                  invalidateKeys={['lead']}
                />
              }
            />
            <InfoRow
              icon={<Mail size={15} />}
              label="邮箱"
              value={
                <InlineEditField
                  value={lead.email}
                  onSave={(v) => leadsApi.update(id, { email: v })}
                  invalidateKeys={['lead']}
                  renderRead={(v) => v ? <a href={`mailto:${v}`} className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{String(v)}</a> : '未填写'}
                />
              }
            />
            <InfoRow
              icon={<Phone size={15} />}
              label="电话"
              value={
                <InlineEditField
                  value={lead.phone}
                  onSave={(v) => leadsApi.update(id, { phone: v })}
                  invalidateKeys={['lead']}
                  renderRead={(v) => v ? <a href={`tel:${v}`} className="text-brand hover:underline">{String(v)}</a> : '未填写'}
                />
              }
            />
            <InfoRow
              icon={<Globe size={15} />}
              label="来源"
              value={
                <InlineEditField
                  value={lead.source}
                  onSave={(v) => leadsApi.update(id, { source: v })}
                  invalidateKeys={['lead']}
                />
              }
            />
          </CardContent>
        </Card>

        {/* Business Info */}
        <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
          <CardHeader className="px-6 pt-6 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <BarChart2 size={16} className="text-indigo-500" />
              </div>
              业务信息
            </CardTitle>
          </CardHeader>
          <Separator className="bg-slate-50 mx-6" />
          <CardContent className="p-6 grid grid-cols-1 gap-3">
            <InfoRow
              icon={<BarChart2 size={15} />}
              label="年收入"
              value={
                <InlineEditField
                  kind="number"
                  value={lead.annualRevenue}
                  onSave={(v) => leadsApi.update(id, { annualRevenue: v })}
                  invalidateKeys={['lead']}
                  renderRead={(v) => v ? fmtMoney(v as number) : '未填写'}
                />
              }
            />
            <InfoRow
              icon={<Factory size={15} />}
              label="行业"
              value={
                <InlineEditField
                  value={lead.industry}
                  onSave={(v) => leadsApi.update(id, { industry: v })}
                  invalidateKeys={['lead']}
                />
              }
            />
            <InfoRow
              icon={<User size={15} />}
              label="负责人 ID"
              value={lead.ownerId}
            />
            <InfoRow
              icon={<Clock size={15} />}
              label="创建时间"
              value={fmtDate(lead.createdAt, 'YYYY-MM-DD HH:mm:ss')}
            />
          </CardContent>
        </Card>

        {/* Conversion Status */}
        <Card className={cn(
          'border-none shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden',
          lead.isConverted
            ? 'bg-gradient-to-br from-emerald-50 to-white'
            : 'bg-white'
        )}>
          <CardHeader className="px-6 pt-6 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center',
                lead.isConverted ? 'bg-emerald-100' : 'bg-slate-100'
              )}>
                <GitMerge size={16} className={lead.isConverted ? 'text-emerald-500' : 'text-slate-400'} />
              </div>
              转化状态
            </CardTitle>
          </CardHeader>
          <Separator className="bg-slate-50 mx-6" />
          <CardContent className="p-6">
            {lead.isConverted ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <div>
                  <p className="font-bold text-emerald-700 text-base">已成功转化</p>
                  <p className="text-sm text-emerald-600/70 font-medium mt-0.5">
                    转化时间：{lead.convertedAt ? fmtDate(lead.convertedAt, 'YYYY-MM-DD HH:mm') : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <GitMerge size={24} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-ink text-base">尚未转化</p>
                    <p className="text-sm text-slate-400 font-medium mt-0.5">
                      可转化为客户、联系人或商机
                    </p>
                  </div>
                </div>
                <Button
                  className="h-10 px-5 rounded-xl font-bold bg-brand hover:bg-brand-deep text-white gap-2 shadow-xl shadow-brand/20"
                  onClick={() => setConvertOpen(true)}
                >
                  <GitMerge size={15} />
                  立即转化
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {lead.description && (
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-3xl bg-white">
            <CardHeader className="px-6 pt-6 pb-4">
              <CardTitle className="text-lg font-bold">备注描述</CardTitle>
            </CardHeader>
            <Separator className="bg-slate-50 mx-6" />
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                {lead.description}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Modal */}
      <LeadFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        lead={lead}
        onSuccess={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ['lead', id] });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {/* Convert Modal */}
      <ConvertLeadModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
        onSuccess={() => {
          setConvertOpen(false);
          queryClient.invalidateQueries({ queryKey: ['lead', id] });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {/* AI Outreach Drawer */}
      <LeadOutreachDrawer
        leadId={id}
        leadEmail={lead.email ?? null}
        leadFullName={`${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || lead.company || '该线索'}
        open={outreachOpen}
        onClose={() => setOutreachOpen(false)}
      />
    </div>
  );
}
