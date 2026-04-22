'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  User,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  GitMerge,
  ChevronRight,
} from 'lucide-react';

interface ConvertLeadModalProps {
  open: boolean;
  onClose: () => void;
  lead: any;
  onSuccess: () => void;
}

const OPP_STAGES = [
  { value: 'prospecting', label: '初步接触' },
  { value: 'qualification', label: '潜在资质' },
  { value: 'needs_analysis', label: '方案需求' },
  { value: 'value_proposition', label: '价值主张' },
  { value: 'proposal', label: '正式提案' },
  { value: 'negotiation', label: '商务谈判' },
];

export function ConvertLeadModal({ open, onClose, lead, onSuccess }: ConvertLeadModalProps) {
  const [createAccount, setCreateAccount] = useState(true);
  const [accountName, setAccountName] = useState('');
  const [createContact, setCreateContact] = useState(true);
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [opportunityName, setOpportunityName] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState('prospecting');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [convertedData, setConvertedData] = useState<any>(null);

  // Pre-fill account name from lead company when toggling on
  function handleToggleAccount(val: boolean) {
    setCreateAccount(val);
    if (val && !accountName && lead?.company) {
      setAccountName(lead.company);
    }
  }

  // Pre-fill opp name when toggling on
  function handleToggleOpp(val: boolean) {
    setCreateOpportunity(val);
    if (val && !opportunityName) {
      const name = [lead?.firstName, lead?.lastName].filter(Boolean).join(' ');
      setOpportunityName(name ? `${name} - 商机` : (lead?.company ? `${lead.company} - 商机` : '新商机'));
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => leadsApi.convert(lead.id, payload),
    onSuccess: (data) => {
      setConvertedData(data);
    },
  });

  function validate() {
    const errs: Record<string, string> = {};
    if (createAccount && !accountName.trim()) {
      errs.accountName = '请填写客户名称';
    }
    if (createOpportunity) {
      if (!opportunityName.trim()) errs.opportunityName = '请填写商机名称';
      if (!closeDate) errs.closeDate = '请选择预计结案日期';
      if (amount && isNaN(Number(amount))) errs.amount = '请输入有效的金额';
    }
    return errs;
  }

  function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const payload: Record<string, unknown> = {
      createAccount,
      createContact,
      createOpportunity,
    };

    if (createAccount) {
      payload.accountName = accountName.trim();
    }

    if (createOpportunity) {
      payload.opportunityName = opportunityName.trim();
      payload.closeDate = closeDate;
      payload.stage = stage;
      if (amount) payload.amount = Number(amount);
    }

    mutation.mutate(payload);
  }

  function handleClose() {
    if (convertedData) {
      onSuccess();
    } else {
      onClose();
    }
    // Reset state for next open
    setTimeout(() => {
      setCreateAccount(true);
      setAccountName('');
      setCreateContact(true);
      setCreateOpportunity(false);
      setOpportunityName('');
      setCloseDate('');
      setAmount('');
      setStage('prospecting');
      setErrors({});
      setConvertedData(null);
    }, 300);
  }

  const leadName = [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || lead?.company || '该线索';

  // ── Success State ────────────────────────────────────────────────────────────
  if (convertedData) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="p-10 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <h2 className="text-2xl font-black text-ink mb-2">转化成功！</h2>
            <p className="text-slate-400 font-medium text-sm mb-6">
              线索「{leadName}」已成功转化，以下记录已创建：
            </p>
            <div className="w-full space-y-3 mb-8">
              {convertedData?.account && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-left">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wide">客户</p>
                    <p className="text-sm font-bold text-blue-700">{convertedData.account.name}</p>
                  </div>
                  <ChevronRight size={14} className="text-blue-300 ml-auto" />
                </div>
              )}
              {convertedData?.contact && (
                <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl text-left">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <User size={16} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-violet-400 uppercase tracking-wide">联系人</p>
                    <p className="text-sm font-bold text-violet-700">
                      {[convertedData.contact.firstName, convertedData.contact.lastName].filter(Boolean).join(' ') || '联系人'}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-violet-300 ml-auto" />
                </div>
              )}
              {convertedData?.opportunity && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl text-left">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <TrendingUp size={16} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">商机</p>
                    <p className="text-sm font-bold text-amber-700">{convertedData.opportunity.name}</p>
                  </div>
                  <ChevronRight size={14} className="text-amber-300 ml-auto" />
                </div>
              )}
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold bg-brand hover:bg-brand-deep text-white shadow-xl shadow-brand/20"
              onClick={handleClose}
            >
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Form State ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-6 border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <GitMerge size={20} className="text-emerald-500" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-ink">转化线索</DialogTitle>
              <p className="text-sm text-slate-400 font-medium mt-0.5">
                将「{leadName}」转化为以下记录
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 py-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {mutation.isError && (
            <div className="flex items-center gap-2.5 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <span>转化失败，请稍后重试</span>
            </div>
          )}

          {/* Create Account Toggle */}
          <div className={cn(
            'rounded-2xl border-2 transition-all overflow-hidden',
            createAccount ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/30'
          )}>
            <button
              type="button"
              className="w-full flex items-center gap-4 p-4 text-left"
              onClick={() => handleToggleAccount(!createAccount)}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                createAccount ? 'bg-blue-100' : 'bg-slate-100'
              )}>
                <Building2 size={18} className={createAccount ? 'text-blue-500' : 'text-slate-400'} />
              </div>
              <div className="flex-1">
                <p className={cn('font-bold text-sm', createAccount ? 'text-blue-700' : 'text-slate-500')}>
                  创建客户（Account）
                </p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">为该线索创建一个新的公司客户</p>
              </div>
              <div className={cn(
                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                createAccount
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-slate-300 bg-white'
              )}>
                {createAccount && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
            {createAccount && (
              <div className="px-4 pb-4">
                <Separator className="bg-blue-100 mb-4" />
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    客户名称 <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    placeholder="输入客户/公司名称"
                    value={accountName}
                    onChange={(e) => {
                      setAccountName(e.target.value);
                      if (errors.accountName) setErrors((p) => { const n = { ...p }; delete n.accountName; return n; });
                    }}
                    className={cn(
                      'h-9 rounded-xl border-blue-200 bg-white font-medium text-sm',
                      errors.accountName && 'border-red-300'
                    )}
                  />
                  {errors.accountName && (
                    <p className="text-xs text-red-500 font-medium">{errors.accountName}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Create Contact Toggle */}
          <div className={cn(
            'rounded-2xl border-2 transition-all',
            createContact ? 'border-violet-200 bg-violet-50/40' : 'border-slate-100 bg-slate-50/30'
          )}>
            <button
              type="button"
              className="w-full flex items-center gap-4 p-4 text-left"
              onClick={() => setCreateContact(!createContact)}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                createContact ? 'bg-violet-100' : 'bg-slate-100'
              )}>
                <User size={18} className={createContact ? 'text-violet-500' : 'text-slate-400'} />
              </div>
              <div className="flex-1">
                <p className={cn('font-bold text-sm', createContact ? 'text-violet-700' : 'text-slate-500')}>
                  创建联系人（Contact）
                </p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  使用该线索的姓名和联系方式创建联系人
                </p>
              </div>
              <div className={cn(
                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                createContact
                  ? 'bg-violet-500 border-violet-500'
                  : 'border-slate-300 bg-white'
              )}>
                {createContact && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          </div>

          {/* Create Opportunity Toggle */}
          <div className={cn(
            'rounded-2xl border-2 transition-all overflow-hidden',
            createOpportunity ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-slate-50/30'
          )}>
            <button
              type="button"
              className="w-full flex items-center gap-4 p-4 text-left"
              onClick={() => handleToggleOpp(!createOpportunity)}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                createOpportunity ? 'bg-amber-100' : 'bg-slate-100'
              )}>
                <TrendingUp size={18} className={createOpportunity ? 'text-amber-500' : 'text-slate-400'} />
              </div>
              <div className="flex-1">
                <p className={cn('font-bold text-sm', createOpportunity ? 'text-amber-700' : 'text-slate-500')}>
                  创建商机（Opportunity）
                </p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">同时创建一个与该线索关联的销售商机</p>
              </div>
              <div className={cn(
                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                createOpportunity
                  ? 'bg-amber-500 border-amber-500'
                  : 'border-slate-300 bg-white'
              )}>
                {createOpportunity && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
            {createOpportunity && (
              <div className="px-4 pb-4">
                <Separator className="bg-amber-100 mb-4" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                      商机名称 <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      placeholder="输入商机名称"
                      value={opportunityName}
                      onChange={(e) => {
                        setOpportunityName(e.target.value);
                        if (errors.opportunityName) setErrors((p) => { const n = { ...p }; delete n.opportunityName; return n; });
                      }}
                      className={cn(
                        'h-9 rounded-xl border-amber-200 bg-white font-medium text-sm',
                        errors.opportunityName && 'border-red-300'
                      )}
                    />
                    {errors.opportunityName && (
                      <p className="text-xs text-red-500 font-medium">{errors.opportunityName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                      预计结案日期 <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={closeDate}
                      onChange={(e) => {
                        setCloseDate(e.target.value);
                        if (errors.closeDate) setErrors((p) => { const n = { ...p }; delete n.closeDate; return n; });
                      }}
                      className={cn(
                        'h-9 rounded-xl border-amber-200 bg-white font-medium text-sm',
                        errors.closeDate && 'border-red-300'
                      )}
                    />
                    {errors.closeDate && (
                      <p className="text-xs text-red-500 font-medium">{errors.closeDate}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                      金额（元）
                    </Label>
                    <Input
                      placeholder="如：100000"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        if (errors.amount) setErrors((p) => { const n = { ...p }; delete n.amount; return n; });
                      }}
                      className={cn(
                        'h-9 rounded-xl border-amber-200 bg-white font-medium text-sm',
                        errors.amount && 'border-red-300'
                      )}
                    />
                    {errors.amount && (
                      <p className="text-xs text-red-500 font-medium">{errors.amount}</p>
                    )}
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                      销售阶段
                    </Label>
                    <Select value={stage} onValueChange={setStage}>
                      <SelectTrigger className="h-9 rounded-xl border-amber-200 bg-white font-medium text-sm">
                        <SelectValue placeholder="选择阶段" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {OPP_STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value} className="font-medium">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!createAccount && !createContact && !createOpportunity && (
            <div className="flex items-center gap-2.5 bg-amber-50 text-amber-600 rounded-xl px-4 py-3 text-sm font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>请至少选择一项需要创建的记录类型</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-50 flex items-center justify-end gap-3 bg-slate-50/30">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-6 rounded-xl font-bold border-slate-200"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            取消
          </Button>
          <Button
            className="h-10 px-6 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-200/50 min-w-[100px] gap-2"
            onClick={handleSubmit}
            disabled={
              mutation.isPending ||
              (!createAccount && !createContact && !createOpportunity)
            }
          >
            {mutation.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                转化中...
              </>
            ) : (
              <>
                <GitMerge size={15} />
                确认转化
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
