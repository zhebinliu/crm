'use client';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Plus, X, ChevronUp, ChevronDown, Columns2, AlignLeft,
  Save, CheckCircle2, AlertCircle, Layout, Database, Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Field {
  id: string;
  apiName: string;
  label: string;
  type: string;
  isSystem: boolean;
  isCustom: boolean;
}

interface LayoutColumn {
  fields: string[]; // apiNames
}

interface LayoutSection {
  id: string;
  title: string;
  columns: 1 | 2;
  columnData: [LayoutColumn] | [LayoutColumn, LayoutColumn];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function buildDefaultLayout(fields: Field[]): LayoutSection[] {
  const system = fields.filter((f) => f.isSystem).map((f) => f.apiName);
  const custom = fields.filter((f) => f.isCustom).map((f) => f.apiName);
  return [
    {
      id: makeId(),
      title: '基本信息',
      columns: 2,
      columnData: [{ fields: system }, { fields: [] }],
    },
    {
      id: makeId(),
      title: '自定义字段',
      columns: 2,
      columnData: [{ fields: custom }, { fields: [] }],
    },
  ];
}

// ─── FieldPill ────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  TEXT: 'bg-blue-50 text-blue-500',
  TEXTAREA: 'bg-blue-50 text-blue-500',
  NUMBER: 'bg-amber-50 text-amber-500',
  CURRENCY: 'bg-emerald-50 text-emerald-500',
  BOOLEAN: 'bg-violet-50 text-violet-500',
  DATE: 'bg-slate-50 text-slate-500',
  DATETIME: 'bg-slate-50 text-slate-500',
  PICKLIST: 'bg-orange-50 text-orange-500',
  REFERENCE: 'bg-indigo-50 text-indigo-500',
};

function typeColor(type: string) {
  return TYPE_COLOR[type] ?? 'bg-slate-50 text-slate-400';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LayoutEditorPage() {
  const params = useParams();
  const objectName = params.objectName as string;

  const [layout, setLayout] = useState<LayoutSection[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedColIdx, setSelectedColIdx] = useState<0 | 1>(0);

  // Fetch object definition
  const { data: objectData, isLoading } = useQuery({
    queryKey: ['admin-object', objectName],
    queryFn: () => adminApi.getObject(objectName),
  });

  const obj = objectData?.data ?? objectData ?? null;
  const allFields: Field[] = obj?.fields ?? [];
  const systemFields = allFields.filter((f) => f.isSystem);
  const customFields = allFields.filter((f) => f.isCustom);

  // Try to load saved layout
  useEffect(() => {
    if (!allFields.length) return;

    // 1. Try server layout from customLayout field
    const customLayout = obj?.customLayout;
    if (customLayout) {
      try {
        const parsed = typeof customLayout === 'string' ? JSON.parse(customLayout) : customLayout;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLayout(parsed);
          return;
        }
      } catch { /* fall through */ }
    }

    // 2. Try localStorage
    try {
      const stored = localStorage.getItem(`layout_${objectName}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLayout(parsed);
          return;
        }
      }
    } catch { /* fall through */ }

    // 3. Default
    setLayout(buildDefaultLayout(allFields));
  }, [allFields.length, objectName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute which fields are already placed
  const placedApiNames = new Set(
    layout.flatMap((s) => s.columnData.flatMap((col) => col.fields)),
  );
  const availableFields = allFields.filter((f) => !placedApiNames.has(f.apiName));
  const availableSystem = availableFields.filter((f) => f.isSystem);
  const availableCustom = availableFields.filter((f) => f.isCustom);

  const saveMutation = useMutation({
    mutationFn: (l: LayoutSection[]) => adminApi.saveLayout(objectName, l),
    onSuccess: () => {
      setSaveStatus('saved');
      setSaveMsg('布局已保存到服务器');
      localStorage.setItem(`layout_${objectName}`, JSON.stringify(layout));
      setTimeout(() => setSaveStatus('idle'), 2500);
    },
    onError: () => {
      // Fall back to localStorage
      try {
        localStorage.setItem(`layout_${objectName}`, JSON.stringify(layout));
        setSaveStatus('saved');
        setSaveMsg('布局已保存到本地（服务端未就绪）');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('error');
        setSaveMsg('保存失败');
        setTimeout(() => setSaveStatus('idle'), 2500);
      }
    },
  });

  function handleSave() {
    setSaveStatus('saving');
    saveMutation.mutate(layout);
  }

  // ── Layout Mutations ──

  function addSection() {
    const newSection: LayoutSection = {
      id: makeId(),
      title: `新区块 ${layout.length + 1}`,
      columns: 2,
      columnData: [{ fields: [] }, { fields: [] }],
    };
    setLayout((prev) => [...prev, newSection]);
  }

  function updateSectionTitle(sectionId: string, title: string) {
    setLayout((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title } : s)),
    );
  }

  function setSectionColumns(sectionId: string, cols: 1 | 2) {
    setLayout((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        if (cols === 1) {
          const merged = [...s.columnData[0].fields, ...(s.columnData[1]?.fields ?? [])];
          return { ...s, columns: 1, columnData: [{ fields: merged }] };
        } else {
          return { ...s, columns: 2, columnData: [s.columnData[0], s.columnData[1] ?? { fields: [] }] };
        }
      }),
    );
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...layout];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setLayout(next);
  }

  function removeSection(sectionId: string) {
    setLayout((prev) => prev.filter((s) => s.id !== sectionId));
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
  }

  function addFieldToSection(sectionId: string, colIdx: 0 | 1, apiName: string) {
    setLayout((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const updated = s.columnData.map((col, i) =>
          i === colIdx ? { fields: [...col.fields, apiName] } : col,
        ) as typeof s.columnData;
        return { ...s, columnData: updated };
      }),
    );
  }

  function removeFieldFromSection(sectionId: string, colIdx: number, apiName: string) {
    setLayout((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const updated = s.columnData.map((col, i) =>
          i === colIdx ? { fields: col.fields.filter((f) => f !== apiName) } : col,
        ) as typeof s.columnData;
        return { ...s, columnData: updated };
      }),
    );
  }

  function moveFieldInColumn(sectionId: string, colIdx: number, fieldIdx: number, dir: -1 | 1) {
    setLayout((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const updated = s.columnData.map((col, i) => {
          if (i !== colIdx) return col;
          const next = [...col.fields];
          const swap = fieldIdx + dir;
          if (swap < 0 || swap >= next.length) return col;
          [next[fieldIdx], next[swap]] = [next[swap], next[fieldIdx]];
          return { fields: next };
        }) as typeof s.columnData;
        return { ...s, columnData: updated };
      }),
    );
  }

  const currentSection = layout.find((s) => s.id === selectedSectionId) ?? null;

  return (
    <div className="flex flex-col h-screen bg-slate-50/30">
      {/* ── Top Bar ── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/metadata/${objectName}`}>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-700 gap-1.5 p-0 h-auto font-semibold text-xs">
              <ArrowLeft size={13} /> 返回字段列表
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-4 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
              <Layout size={14} className="text-brand" />
            </div>
            <div>
              <h1 className="text-sm font-black text-ink leading-none">
                页面布局 — <span className="font-mono uppercase">{objectName}</span>
              </h1>
              <p className="text-[10px] text-slate-400 mt-0.5">{layout.length} 个区块 · {placedApiNames.size} 个字段已配置</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 size={13} /> {saveMsg}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-500 text-xs font-semibold">
              <AlertCircle size={13} /> {saveMsg || '保存失败'}
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="bg-brand hover:bg-brand-deep text-white font-bold h-9 px-5 text-xs"
          >
            <Save size={13} className="mr-1.5" />
            {saveStatus === 'saving' ? '保存中...' : '保存布局'}
          </Button>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Available Fields Panel ── */}
        <div className="w-72 shrink-0 border-r border-slate-100 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 shrink-0">
            <div className="flex items-center gap-2">
              <Database size={13} className="text-slate-400" />
              <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest">可用字段</span>
            </div>
            <p className="text-[10px] text-slate-300 mt-1">
              点击"→"将字段添加到选中区块的指定列
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {isLoading && (
              <div className="py-10 text-center text-slate-300 text-xs">加载字段中...</div>
            )}

            {/* Target selector */}
            {layout.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-300">添加目标</Label>
                <select
                  className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-600 font-medium"
                  value={selectedSectionId ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value || null)}
                >
                  <option value="">选择区块...</option>
                  {layout.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                {currentSection && currentSection.columns === 2 && (
                  <select
                    className="w-full h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-600 font-medium"
                    value={selectedColIdx}
                    onChange={(e) => setSelectedColIdx(Number(e.target.value) as 0 | 1)}
                  >
                    <option value={0}>第 1 列</option>
                    <option value={1}>第 2 列</option>
                  </select>
                )}
              </div>
            )}

            {availableSystem.length > 0 && (
              <AvailableFieldGroup
                title="系统字段"
                fields={availableSystem}
                canAdd={!!selectedSectionId}
                onAdd={(apiName) => {
                  if (!selectedSectionId) return;
                  const colIdx = currentSection?.columns === 1 ? 0 : selectedColIdx;
                  addFieldToSection(selectedSectionId, colIdx, apiName);
                }}
              />
            )}

            {availableCustom.length > 0 && (
              <AvailableFieldGroup
                title="自定义字段"
                fields={availableCustom}
                canAdd={!!selectedSectionId}
                onAdd={(apiName) => {
                  if (!selectedSectionId) return;
                  const colIdx = currentSection?.columns === 1 ? 0 : selectedColIdx;
                  addFieldToSection(selectedSectionId, colIdx, apiName);
                }}
              />
            )}

            {!isLoading && availableFields.length === 0 && (
              <div className="py-8 text-center">
                <Tag size={24} className="mx-auto text-slate-200 mb-2" />
                <p className="text-xs text-slate-300 font-medium">所有字段已放置</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Layout Canvas ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">布局画布</span>
            <Button
              size="sm"
              variant="outline"
              onClick={addSection}
              className="text-xs font-bold h-8 px-3 border-brand/30 text-brand hover:bg-brand/5"
            >
              <Plus size={13} className="mr-1" /> 添加区块
            </Button>
          </div>

          {layout.length === 0 && !isLoading && (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl">
              <Layout size={36} className="mx-auto text-slate-200 mb-3" />
              <p className="text-slate-400 font-semibold text-sm">布局为空</p>
              <p className="text-slate-300 text-xs mt-1">点击「添加区块」开始构建页面布局</p>
            </div>
          )}

          {layout.map((section, sIdx) => (
            <SectionCard
              key={section.id}
              section={section}
              allFields={allFields}
              isSelected={selectedSectionId === section.id}
              onSelect={() => setSelectedSectionId(section.id)}
              onTitleChange={(t) => updateSectionTitle(section.id, t)}
              onColumnsChange={(c) => setSectionColumns(section.id, c)}
              onMoveUp={() => moveSection(sIdx, -1)}
              onMoveDown={() => moveSection(sIdx, 1)}
              canMoveUp={sIdx > 0}
              canMoveDown={sIdx < layout.length - 1}
              onDelete={() => removeSection(section.id)}
              onRemoveField={(colIdx, apiName) => removeFieldFromSection(section.id, colIdx, apiName)}
              onMoveField={(colIdx, fieldIdx, dir) => moveFieldInColumn(section.id, colIdx, fieldIdx, dir)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AvailableFieldGroup ──────────────────────────────────────────────────────

function AvailableFieldGroup({
  title,
  fields,
  canAdd,
  onAdd,
}: {
  title: string;
  fields: Field[];
  canAdd: boolean;
  onAdd: (apiName: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase text-slate-300 tracking-widest px-1">{title}</p>
      {fields.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100 group"
        >
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0', typeColor(f.type))}>
            {f.type.slice(0, 4)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink truncate leading-tight">{f.label}</p>
            <p className="text-[9px] font-mono text-slate-300 truncate">{f.apiName}</p>
          </div>
          <button
            onClick={() => onAdd(f.apiName)}
            disabled={!canAdd}
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-brand hover:bg-brand/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title={canAdd ? '添加到选中区块' : '请先选择目标区块'}
          >
            <ChevronUp size={13} className="rotate-90" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: LayoutSection;
  allFields: Field[];
  isSelected: boolean;
  onSelect: () => void;
  onTitleChange: (t: string) => void;
  onColumnsChange: (c: 1 | 2) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDelete: () => void;
  onRemoveField: (colIdx: number, apiName: string) => void;
  onMoveField: (colIdx: number, fieldIdx: number, dir: -1 | 1) => void;
}

function SectionCard({
  section, allFields, isSelected, onSelect, onTitleChange, onColumnsChange,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown, onDelete, onRemoveField, onMoveField,
}: SectionCardProps) {
  const fieldMap = new Map(allFields.map((f) => [f.apiName, f]));

  return (
    <div
      onClick={onSelect}
      className={cn(
        'rounded-2xl border bg-white transition-all cursor-pointer',
        isSelected ? 'border-brand/30 shadow-md shadow-brand/10' : 'border-slate-100 shadow-sm hover:border-slate-200',
      )}
    >
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50">
        <Input
          value={section.title}
          onChange={(e) => { e.stopPropagation(); onTitleChange(e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          className="h-8 text-sm font-bold border-none shadow-none p-0 bg-transparent focus-visible:ring-0 text-ink w-48"
        />
        <div className="flex items-center gap-1 ml-auto">
          {/* Column toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onColumnsChange(1); }}
            className={cn(
              'p-1.5 rounded-md transition-colors text-xs',
              section.columns === 1 ? 'bg-brand/10 text-brand' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50',
            )}
            title="单列"
          >
            <AlignLeft size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onColumnsChange(2); }}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              section.columns === 2 ? 'bg-brand/10 text-brand' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50',
            )}
            title="双列"
          >
            <Columns2 size={13} />
          </button>

          <Separator orientation="vertical" className="h-4 mx-1 bg-slate-100" />

          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={!canMoveUp}
            className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={!canMoveDown}
            className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronDown size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className={cn('p-4 gap-4', section.columns === 2 ? 'grid grid-cols-2' : 'flex flex-col')}>
        {section.columnData.map((col, colIdx) => (
          <div key={colIdx} className="min-h-[80px] space-y-1.5">
            {section.columns === 2 && (
              <p className="text-[10px] font-bold uppercase text-slate-300 tracking-widest mb-2">
                第 {colIdx + 1} 列
              </p>
            )}
            {col.fields.length === 0 ? (
              <div className="py-6 border-2 border-dashed border-slate-100 rounded-xl text-center">
                <p className="text-[10px] text-slate-200 font-medium">空列 — 从左侧添加字段</p>
              </div>
            ) : (
              col.fields.map((apiName, fieldIdx) => {
                const f = fieldMap.get(apiName);
                return (
                  <div
                    key={apiName}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 group hover:border-slate-200 transition-colors"
                  >
                    {f && (
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0', typeColor(f.type))}>
                        {f.type.slice(0, 4)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{f?.label ?? apiName}</p>
                      <p className="text-[9px] font-mono text-slate-300 truncate">{apiName}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); onMoveField(colIdx, fieldIdx, -1); }}
                        disabled={fieldIdx === 0}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-400"
                      >
                        <ChevronUp size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMoveField(colIdx, fieldIdx, 1); }}
                        disabled={fieldIdx === col.fields.length - 1}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-400"
                      >
                        <ChevronDown size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveField(colIdx, apiName); }}
                        className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
