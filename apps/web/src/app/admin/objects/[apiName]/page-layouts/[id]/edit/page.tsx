'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, X, Save,
  CheckCircle2, AlertCircle, Layout as LayoutIcon, Type, ListTree, FileText, Trash2,
} from 'lucide-react';
import { adminApi, pageLayoutApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// ── Section schema ─────────────────────────────────────────────────────────

interface FieldDef {
  id: string;
  apiName: string;
  label: string;
  type: string;
}

type SectionType = 'section' | 'related-list' | 'rich-text';

interface FieldsRow { fields: string[] }

interface SectionBlock {
  _id: string;
  type: 'section';
  title: string;
  columns: 1 | 2 | 3;
  rows: FieldsRow[];
}

interface RelatedListBlock {
  _id: string;
  type: 'related-list';
  title: string;
  relatedObject: string;
  relatedField: string;
  columns: string[];
}

interface RichTextBlock {
  _id: string;
  type: 'rich-text';
  title?: string;
  content: string;
}

type LayoutBlock = SectionBlock | RelatedListBlock | RichTextBlock;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalize(raw: unknown[]): LayoutBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any): LayoutBlock => {
    const t: SectionType = s?.type ?? 'section';
    if (t === 'related-list') {
      return {
        _id: uid(),
        type: 'related-list',
        title: s.title ?? '',
        relatedObject: s.relatedObject ?? '',
        relatedField: s.relatedField ?? '',
        columns: Array.isArray(s.columns) ? s.columns : [],
      };
    }
    if (t === 'rich-text') {
      return {
        _id: uid(),
        type: 'rich-text',
        title: s.title ?? '',
        content: s.content ?? '',
      };
    }
    // section
    const cols: 1 | 2 | 3 =
      s.columns === 1 || s.columns === 2 || s.columns === 3 ? s.columns : 2;
    let rows: FieldsRow[] = [];
    if (Array.isArray(s.rows)) {
      rows = s.rows.map((r: any) => ({
        fields: Array.isArray(r?.fields)
          ? r.fields.map((f: any) => (typeof f === 'string' ? f : f?.apiName)).filter(Boolean)
          : [],
      }));
    }
    return {
      _id: uid(),
      type: 'section',
      title: s.title ?? '',
      columns: cols,
      rows,
    };
  });
}

function stripIds(blocks: LayoutBlock[]): unknown[] {
  return blocks.map((b) => {
    const { _id, ...rest } = b as any;
    return rest;
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LayoutEditPage() {
  const params = useParams();
  const apiName = params.apiName as string;
  const layoutId = params.id as string;

  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [label, setLabel] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMsg, setSaveMsg] = useState('');

  const { data: layoutData, isLoading } = useQuery({
    queryKey: ['pl-detail', apiName, layoutId],
    queryFn: () => pageLayoutApi.get(apiName, layoutId),
  });

  const { data: objData } = useQuery({
    queryKey: ['admin-object', apiName],
    queryFn: () => adminApi.getObject(apiName),
  });
  const obj = objData?.data ?? objData;
  const fields: FieldDef[] = obj?.fields ?? [];

  useEffect(() => {
    if (layoutData) {
      setBlocks(normalize((layoutData as any).sections ?? []));
      setLabel((layoutData as any).label ?? '');
    }
  }, [layoutData]);

  const saveMut = useMutation({
    mutationFn: () => pageLayoutApi.update(apiName, layoutId, {
      label: label.trim() || undefined,
      sections: stripIds(blocks),
    }),
    onMutate: () => { setSaveStatus('saving'); setSaveMsg(''); },
    onSuccess: () => {
      setSaveStatus('saved');
      setSaveMsg('已保存');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: (err: unknown) => {
      setSaveStatus('error');
      setSaveMsg(extractMsg(err) ?? '保存失败');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  // ── mutations on blocks ──
  function addSection() {
    setBlocks((p) => [...p, {
      _id: uid(),
      type: 'section',
      title: `区块 ${p.length + 1}`,
      columns: 2,
      rows: [{ fields: [] }],
    }]);
  }
  function addRelatedList() {
    setBlocks((p) => [...p, {
      _id: uid(),
      type: 'related-list',
      title: '相关列表',
      relatedObject: '',
      relatedField: '',
      columns: [],
    }]);
  }
  function addRichText() {
    setBlocks((p) => [...p, {
      _id: uid(),
      type: 'rich-text',
      title: '说明',
      content: '',
    }]);
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks((p) => {
      const next = [...p];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return p;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function removeBlock(id: string) {
    setBlocks((p) => p.filter((b) => b._id !== id));
  }
  function updateBlock(id: string, patch: Partial<LayoutBlock>) {
    setBlocks((p) => p.map((b) => (b._id === id ? ({ ...b, ...patch } as LayoutBlock) : b)));
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50/30">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/objects/${apiName}/page-layouts`}>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-700 gap-1.5 p-0 h-auto font-semibold text-xs">
              <ArrowLeft size={13} /> 返回布局列表
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-4 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
              <LayoutIcon size={14} className="text-brand" />
            </div>
            <div>
              <h1 className="text-sm font-black text-ink leading-none">
                布局编辑器 — <span className="font-mono uppercase">{apiName}</span>
              </h1>
              <p className="text-[10px] text-slate-400 mt-0.5">{blocks.length} 个区块</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="布局标签"
            className="h-9 w-48 text-xs font-bold border-slate-200"
          />
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
            onClick={() => saveMut.mutate()}
            disabled={saveStatus === 'saving' || isLoading}
            className="bg-brand hover:bg-brand-deep text-white font-bold h-9 px-5 text-xs"
          >
            <Save size={13} className="mr-1.5" />
            {saveStatus === 'saving' ? '保存中...' : '保存布局'}
          </Button>
        </div>
      </div>

      {/* Main 2-pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor */}
        <div className="w-[60%] overflow-y-auto p-6 border-r border-slate-100 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">结构编辑</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addSection} className="text-xs font-bold h-8 px-3 border-brand/30 text-brand hover:bg-brand/5">
                <Plus size={12} className="mr-1" /> 添加 Section
              </Button>
              <Button size="sm" variant="outline" onClick={addRelatedList} className="text-xs font-bold h-8 px-3 border-violet-300 text-violet-600 hover:bg-violet-50">
                <Plus size={12} className="mr-1" /> 添加 Related-list
              </Button>
              <Button size="sm" variant="outline" onClick={addRichText} className="text-xs font-bold h-8 px-3 border-slate-300 text-slate-600 hover:bg-slate-50">
                <Plus size={12} className="mr-1" /> 添加 RichText
              </Button>
            </div>
          </div>

          {isLoading && (
            <div className="py-20 text-center text-slate-400 text-sm">加载布局...</div>
          )}

          {!isLoading && blocks.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl">
              <LayoutIcon size={36} className="mx-auto text-slate-200 mb-3" />
              <p className="text-slate-400 font-semibold text-sm">布局为空</p>
              <p className="text-slate-300 text-xs mt-1">从右上角添加区块开始构建</p>
            </div>
          )}

          {blocks.map((b, idx) => (
            <BlockEditor
              key={b._id}
              block={b}
              fields={fields}
              canMoveUp={idx > 0}
              canMoveDown={idx < blocks.length - 1}
              onMoveUp={() => moveBlock(idx, -1)}
              onMoveDown={() => moveBlock(idx, 1)}
              onRemove={() => removeBlock(b._id)}
              onUpdate={(patch) => updateBlock(b._id, patch)}
            />
          ))}
        </div>

        {/* Right: live preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">实时预览</span>
          <LayoutPreview blocks={blocks} fields={fields} />
        </div>
      </div>
    </div>
  );
}

// ── Block editor ───────────────────────────────────────────────────────────

function BlockEditor({
  block, fields, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove, onUpdate,
}: {
  block: LayoutBlock;
  fields: FieldDef[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<LayoutBlock>) => void;
}) {
  const typeStyle = block.type === 'section'
    ? 'bg-brand/5 text-brand border-brand/20'
    : block.type === 'related-list'
      ? 'bg-violet-50 text-violet-600 border-violet-100'
      : 'bg-slate-50 text-slate-600 border-slate-100';
  const Icon = block.type === 'section' ? Type : block.type === 'related-list' ? ListTree : FileText;
  const typeLabel = block.type === 'section' ? 'SECTION' : block.type === 'related-list' ? 'RELATED-LIST' : 'RICH-TEXT';

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-50">
        <span className={cn('text-[9px] font-black px-2 py-1 rounded font-mono uppercase tracking-wider border', typeStyle)}>
          <Icon size={9} className="inline -mt-0.5 mr-1" />
          {typeLabel}
        </span>
        <Input
          value={block.type === 'rich-text' ? (block.title ?? '') : block.title}
          onChange={(e) => onUpdate({ title: e.target.value } as any)}
          placeholder="区块标题"
          className="h-8 text-sm font-bold border-none shadow-none p-0 bg-transparent focus-visible:ring-0 text-ink flex-1"
        />
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"><ChevronUp size={13} /></button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"><ChevronDown size={13} /></button>
          <button onClick={onRemove} className="p-1.5 rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors ml-1"><X size={13} /></button>
        </div>
      </div>

      <div className="p-4">
        {block.type === 'section' && <SectionEditor block={block} fields={fields} onUpdate={onUpdate as any} />}
        {block.type === 'related-list' && <RelatedListEditor block={block} onUpdate={onUpdate as any} />}
        {block.type === 'rich-text' && <RichTextEditor block={block} onUpdate={onUpdate as any} />}
      </div>
    </div>
  );
}

function SectionEditor({
  block, fields, onUpdate,
}: {
  block: SectionBlock;
  fields: FieldDef[];
  onUpdate: (patch: Partial<SectionBlock>) => void;
}) {
  function setRows(rows: FieldsRow[]) { onUpdate({ rows }); }
  function addRow() { setRows([...block.rows, { fields: [] }]); }
  function removeRow(idx: number) { setRows(block.rows.filter((_, i) => i !== idx)); }
  function moveRow(idx: number, dir: -1 | 1) {
    const next = [...block.rows];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setRows(next);
  }
  function updateRow(idx: number, fieldsList: string[]) {
    setRows(block.rows.map((r, i) => (i === idx ? { fields: fieldsList } : r)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label className="text-[10px] font-black uppercase text-slate-400">列数</Label>
        <Select
          value={String(block.columns)}
          onValueChange={(v) => onUpdate({ columns: Number(v) as 1 | 2 | 3 })}
        >
          <SelectTrigger className="h-8 w-24 text-xs border-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 列</SelectItem>
            <SelectItem value="2">2 列</SelectItem>
            <SelectItem value="3">3 列</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-slate-400 ml-auto">{block.rows.length} 行</span>
      </div>

      <div className="space-y-2">
        {block.rows.map((row, idx) => (
          <RowEditor
            key={idx}
            row={row}
            fields={fields}
            columns={block.columns}
            canMoveUp={idx > 0}
            canMoveDown={idx < block.rows.length - 1}
            onMoveUp={() => moveRow(idx, -1)}
            onMoveDown={() => moveRow(idx, 1)}
            onRemove={() => removeRow(idx)}
            onChange={(next) => updateRow(idx, next)}
          />
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={addRow} className="text-[11px] font-bold h-7 px-3 border-slate-200">
        <Plus size={11} className="mr-1" /> 添加行
      </Button>
    </div>
  );
}

function RowEditor({
  row, fields, columns, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove, onChange,
}: {
  row: FieldsRow;
  fields: FieldDef[];
  columns: 1 | 2 | 3;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (fields: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.apiName, f])), [fields]);
  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return fields
      .filter((f) => !row.fields.includes(f.apiName))
      .filter((f) => f.apiName.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, fields, row.fields]);

  function add(apiName: string) {
    if (row.fields.includes(apiName)) return;
    if (row.fields.length >= columns) return;
    onChange([...row.fields, apiName]);
    setSearch('');
  }
  function remove(apiName: string) { onChange(row.fields.filter((f) => f !== apiName)); }

  const slots = Array.from({ length: columns }).map((_, i) => row.fields[i] ?? null);

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3 space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase text-slate-300 tracking-wider">行</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronUp size={11} /></button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronDown size={11} /></button>
          <button onClick={onRemove} className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50"><Trash2 size={11} /></button>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {slots.map((apiName, i) => {
          if (!apiName) {
            return (
              <div key={i} className="h-9 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-300 font-medium">
                空位
              </div>
            );
          }
          const f = fieldMap.get(apiName);
          return (
            <div key={i} className="h-9 rounded-lg bg-white border border-slate-200 flex items-center gap-2 px-2 group">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ink truncate leading-tight">{f?.label ?? apiName}</p>
                <p className="text-[9px] font-mono text-slate-300 truncate">{apiName}</p>
              </div>
              <button onClick={() => remove(apiName)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 shrink-0">
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {row.fields.length < columns && (
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入字段名或标签搜索..."
            className="h-8 text-xs border-slate-200"
          />
          {matched.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-100 rounded-lg shadow-lg max-h-56 overflow-auto">
              {matched.map((f) => (
                <button
                  key={f.apiName}
                  onClick={() => add(f.apiName)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-slate-100 text-slate-500 shrink-0">{f.type.slice(0, 4)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{f.label}</p>
                    <p className="text-[9px] font-mono text-slate-300 truncate">{f.apiName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelatedListEditor({
  block, onUpdate,
}: {
  block: RelatedListBlock;
  onUpdate: (patch: Partial<RelatedListBlock>) => void;
}) {
  const [colInput, setColInput] = useState('');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase text-slate-400">关联对象 apiName</Label>
          <Input
            value={block.relatedObject}
            onChange={(e) => onUpdate({ relatedObject: e.target.value })}
            placeholder="Contact"
            className="h-9 text-xs font-mono border-slate-200"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase text-slate-400">外键字段</Label>
          <Input
            value={block.relatedField}
            onChange={(e) => onUpdate({ relatedField: e.target.value })}
            placeholder="accountId"
            className="h-9 text-xs font-mono border-slate-200"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase text-slate-400">显示列（apiName，逗号或回车分隔）</Label>
        <div className="flex gap-2">
          <Input
            value={colInput}
            onChange={(e) => setColInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && colInput.trim()) {
                e.preventDefault();
                onUpdate({ columns: [...block.columns, colInput.trim()] });
                setColInput('');
              }
            }}
            placeholder="name, email, phone..."
            className="h-9 text-xs font-mono border-slate-200"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!colInput.trim()}
            onClick={() => { onUpdate({ columns: [...block.columns, colInput.trim()] }); setColInput(''); }}
            className="h-9 text-xs font-bold"
          >
            添加
          </Button>
        </div>
        {block.columns.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {block.columns.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-600 text-[10px] font-mono font-bold">
                {c}
                <button onClick={() => onUpdate({ columns: block.columns.filter((_, idx) => idx !== i) })} className="hover:text-red-500">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RichTextEditor({
  block, onUpdate,
}: {
  block: RichTextBlock;
  onUpdate: (patch: Partial<RichTextBlock>) => void;
}) {
  return (
    <Textarea
      value={block.content}
      onChange={(e) => onUpdate({ content: e.target.value })}
      placeholder="输入 Markdown / 纯文本说明..."
      className="min-h-[100px] text-xs border-slate-200 resize-y"
    />
  );
}

// ── Live preview ────────────────────────────────────────────────────────────

function LayoutPreview({ blocks, fields }: { blocks: LayoutBlock[]; fields: FieldDef[] }) {
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.apiName, f])), [fields]);
  if (blocks.length === 0) {
    return (
      <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
        <LayoutIcon size={36} className="mx-auto text-slate-200 mb-3" />
        <p className="text-slate-300 text-xs">预览将随编辑实时更新</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {blocks.map((b) => {
        if (b.type === 'section') {
          return (
            <div key={b._id} className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50">
                <p className="text-sm font-bold text-ink">{b.title || '未命名区块'}</p>
              </div>
              <div className="p-4 space-y-2">
                {b.rows.length === 0 && (
                  <p className="text-[11px] text-slate-300 italic">该区块尚无字段</p>
                )}
                {b.rows.map((r, i) => (
                  <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${b.columns}, minmax(0, 1fr))` }}>
                    {Array.from({ length: b.columns }).map((_, ci) => {
                      const apiName = r.fields[ci];
                      if (!apiName) {
                        return <div key={ci} className="h-10" />;
                      }
                      const f = fieldMap.get(apiName);
                      return (
                        <div key={ci} className="space-y-1">
                          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-tight">{f?.label ?? apiName}</p>
                          <div className="h-8 rounded-md bg-slate-50 border border-slate-100 flex items-center px-2">
                            <span className="text-[10px] font-mono text-slate-400">— 示例值 —</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (b.type === 'related-list') {
          return (
            <div key={b._id} className="rounded-2xl bg-white border border-violet-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-violet-50 flex items-center justify-between">
                <p className="text-sm font-bold text-violet-700">{b.title || '相关列表'}</p>
                <span className="text-[10px] font-mono text-violet-400">{b.relatedObject}.{b.relatedField}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-violet-50/40 rounded-lg">
                  {b.columns.length === 0 ? (
                    <span className="text-[10px] text-slate-300">未配置显示列</span>
                  ) : (
                    b.columns.map((c, i) => (
                      <span key={i} className="text-[10px] font-bold uppercase text-violet-500 tracking-tight">{c}</span>
                    ))
                  )}
                </div>
                <div className="text-[10px] text-slate-300 italic mt-2 px-3">— 子记录列表预览 —</div>
              </div>
            </div>
          );
        }
        // rich-text
        return (
          <div key={b._id} className="rounded-2xl bg-amber-50/40 border border-amber-100 p-4">
            {b.title && <p className="text-sm font-bold text-amber-700 mb-2">{b.title}</p>}
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{b.content || '（空说明）'}</p>
          </div>
        );
      })}
    </div>
  );
}

function extractMsg(err: unknown): string | undefined {
  const m = (err as any)?.response?.data?.message
    ?? (err as any)?.response?.data?.error?.message
    ?? (err as any)?.message;
  return Array.isArray(m) ? m.join('; ') : m;
}
