'use client';
import { useState } from 'react';
import { X, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_STAGES = [
  { value: 'prospecting',       label: '勘探' },
  { value: 'qualification',     label: '资质评估' },
  { value: 'needs_analysis',    label: '需求分析' },
  { value: 'value_proposition', label: '价值主张' },
  { value: 'proposal',          label: '提案' },
  { value: 'negotiation',       label: '谈判' },
  { value: 'closed_won',        label: '赢单' },
  { value: 'closed_lost',       label: '丢单' },
];

const CATS = [
  { value: 'pipeline',  label: '流水线',  color: 'text-info-text  bg-info-light' },
  { value: 'best_case', label: '最佳预期', color: 'text-warning-text bg-warning-light' },
  { value: 'commit',    label: '已承诺',  color: 'text-brand-deep bg-brand-light' },
  { value: 'closed',    label: '已赢单',  color: 'text-success-text bg-success-light' },
  { value: 'omitted',   label: '排除',    color: 'text-ink-muted bg-surface-tertiary' },
] as const;

type Cat = 'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted';

interface Props {
  open: boolean;
  config: {
    categories: Record<string, string>;
    objectApiName: string;
    amountField: string;
    dateField: string;
    stageField: string;
    ownerField: string;
  };
  saving: boolean;
  onClose: () => void;
  onSave: (cfg: { categories: Record<string, string>; objectApiName: string; amountField: string; dateField: string; stageField: string; ownerField: string }) => void;
}

export function ForecastConfigModal({ open, config, saving, onClose, onSave }: Props) {
  const [cats, setCats] = useState<Record<string, Cat>>(() => config.categories as Record<string, Cat>);
  const [obj, setObj] = useState(config.objectApiName);
  const [amtF, setAmtF] = useState(config.amountField);
  const [dateF, setDateF] = useState(config.dateField);
  const [stageF, setStageF] = useState(config.stageField);
  const [ownerF, setOwnerF] = useState(config.ownerField);
  const [tab, setTab] = useState<'categories' | 'object'>('categories');

  if (!open) return null;

  function handleSave() {
    onSave({ categories: cats, objectApiName: obj, amountField: amtF, dateField: dateF, stageField: stageF, ownerField: ownerF });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-border w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-black text-ink">预测设置</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 gap-4">
          {(['categories', 'object'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('py-3 text-xs font-bold border-b-2 -mb-px transition-all',
                tab === t ? 'text-brand border-brand' : 'text-ink-secondary border-transparent hover:text-ink')}>
              {t === 'categories' ? '预测类别构成' : '数据对象配置'}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {tab === 'categories' && (
            <>
              <p className="text-xs text-ink-muted">为每个销售阶段指定所属的预测类别，影响流水线、最佳预期、已承诺的金额统计。</p>
              <div className="space-y-2">
                {ALL_STAGES.map((s) => {
                  const cur = (cats[s.value] ?? 'pipeline') as Cat;
                  const catDef = CATS.find((c) => c.value === cur);
                  return (
                    <div key={s.value} className="flex items-center justify-between py-2 border-b border-border/50">
                      <span className="text-sm font-semibold text-ink w-28">{s.label}</span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {CATS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setCats((prev) => ({ ...prev, [s.value]: c.value }))}
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                              cur === c.value ? c.color : 'bg-surface-secondary text-ink-muted hover:bg-surface-tertiary',
                            )}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'object' && (
            <>
              <p className="text-xs text-ink-muted">配置用于预测统计的数据对象和字段映射。默认使用商机（opportunity）。</p>
              <div className="space-y-3">
                {[
                  { label: '对象 API 名称', val: obj, set: setObj, placeholder: 'opportunity' },
                  { label: '金额字段', val: amtF, set: setAmtF, placeholder: 'amount' },
                  { label: '日期字段（关闭/到期）', val: dateF, set: setDateF, placeholder: 'closeDate' },
                  { label: '阶段字段', val: stageF, set: setStageF, placeholder: 'stage' },
                  { label: '负责人字段', val: ownerF, set: setOwnerF, placeholder: 'ownerId' },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <label className="text-xs font-bold text-ink-secondary uppercase tracking-wider">{f.label}</label>
                    <input
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all font-mono"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 btn-primary text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            保存配置
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-ink-secondary hover:text-ink text-sm font-bold transition-all">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
