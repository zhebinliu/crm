'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Trash2, X, Download, Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RelatedSelect } from '@/components/crm/related-select';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  editable?: boolean;
  type?: 'text' | 'select' | 'email' | 'phone' | 'number' | 'related';
  options?: { value: string; label: string }[];
  relatedTo?: string;
  relatedLabelField?: string;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  onDelete?: (ids: string[]) => Promise<void>;
  onUpdate?: (id: string, field: string, value: unknown) => Promise<void>;
  onBulkUpdate?: (ids: string[], field: string, value: unknown) => Promise<void>;
  queryKey?: string[];
  loading?: boolean;
  rowClassName?: string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  onRowClick,
  onDelete,
  onUpdate,
  onBulkUpdate,
  queryKey = ['data'],
  loading = false,
  rowClassName,
}: DataTableProps<T>) {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [relatedAnchor, setRelatedAnchor] = useState<{ rowId: string; field: string; value: string; label: string; rect: DOMRect } | null>(null);

  // Bulk update panel state
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkField, setBulkField] = useState<string>('');
  const [bulkValue, setBulkValue] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  const editableColumns = columns.filter((c) => c.editable);

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      if (onUpdate) await onUpdate(id, field, value);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (onDelete) await onDelete(ids);
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, field, value }: { ids: string[]; field: string; value: unknown }) => {
      if (onBulkUpdate) await onBulkUpdate(ids, field, value);
    },
    onSuccess: () => {
      setShowBulkUpdate(false);
      setBulkField('');
      setBulkValue('');
      qc.invalidateQueries({ queryKey });
    },
  });

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(data.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const startEdit = useCallback((rowId: string, field: string, currentValue: unknown, rect?: DOMRect) => {
    const col = columns.find((c) => c.key === field);
    if (col?.type === 'related') {
      const row = data.find((r) => r.id === rowId) as Record<string, unknown>;
      setRelatedAnchor({
        rowId,
        field,
        value: String(row?.[field + 'Id'] ?? ''),
        label: String(currentValue ?? ''),
        rect: rect!,
      });
      return;
    }
    setEditingCell({ rowId, field });
    setEditValue(currentValue != null ? String(currentValue) : '');
  }, [columns, data]);

  const saveEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowId, field } = editingCell;
    updateMutation.mutate({ id: rowId, field, value: editValue });
    setEditingCell(null);
  }, [editingCell, editValue, updateMutation]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleRelatedSelect = useCallback((_id: string, _label: string) => {
    if (!relatedAnchor) return;
    updateMutation.mutate({ id: relatedAnchor.rowId, field: relatedAnchor.field, value: _id });
    setRelatedAnchor(null);
  }, [relatedAnchor, updateMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  // CSV export
  const handleExportCsv = useCallback(() => {
    const rowsToExport =
      selectedIds.size > 0
        ? data.filter((r) => selectedIds.has(r.id))
        : data;

    const headers = columns.map((c) => c.label);
    const rows = rowsToExport.map((row) =>
      columns.map((col) => {
        let cellValue: unknown;
        if (col.render) {
          const rendered = col.render(row);
          // Use raw value if render returns non-string (React element)
          cellValue =
            typeof rendered === 'string' || typeof rendered === 'number'
              ? rendered
              : (row as Record<string, unknown>)[col.key];
        } else {
          cellValue = (row as Record<string, unknown>)[col.key];
        }
        const str = cellValue != null ? String(cellValue) : '';
        // Escape CSV: wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
    );

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, selectedIds, columns]);

  // Bulk update handlers
  const handleBulkUpdateConfirm = () => {
    if (!bulkField || bulkValue === '') return;
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      field: bulkField,
      value: bulkValue,
    });
  };

  const selectedBulkColumn = editableColumns.find((c) => c.key === bulkField);

  const isAllSelected = data.length > 0 && selectedIds.size === data.length;
  const isSomeSelected = selectedIds.size > 0;

  return (
    <div className="relative">
      {/* Bulk Action Bar */}
      {isSomeSelected && (
        <div className="sticky top-0 z-30 mb-2">
          <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand-light px-4 py-3 shadow-sm">
            <span className="text-sm font-bold text-brand-deep">
              已选择 <span className="font-black">{selectedIds.size}</span> 条
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportCsv}
                className="h-8 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100"
              >
                <Download size={14} className="mr-1" />
                导出CSV
              </Button>
              {onBulkUpdate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowBulkUpdate((v) => !v);
                    setBulkField('');
                    setBulkValue('');
                  }}
                  className="h-8 rounded-lg text-brand hover:text-brand-deep hover:bg-brand/10"
                >
                  <Pencil size={14} className="mr-1" />
                  批量更新
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="h-8 rounded-lg text-slate-500 hover:text-slate-700"
              >
                <X size={14} className="mr-1" />
                取消
              </Button>
              {onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
                  disabled={deleteMutation.isPending}
                  className="h-8 rounded-lg bg-danger hover:bg-danger/90 text-white disabled:opacity-50"
                >
                  <Trash2 size={14} className="mr-1" />
                  删除
                </Button>
              )}
            </div>
          </div>

          {/* Bulk Update Inline Panel */}
          {showBulkUpdate && onBulkUpdate && (
            <div className="mt-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                批量更新字段
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Field selector */}
                <Select
                  value={bulkField}
                  onValueChange={(v) => {
                    setBulkField(v);
                    setBulkValue('');
                  }}
                >
                  <SelectTrigger className="h-8 rounded-lg w-40 text-sm">
                    <SelectValue placeholder="选择字段" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableColumns.map((col) => (
                      <SelectItem key={col.key} value={col.key}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value input based on column type */}
                {bulkField && selectedBulkColumn && (
                  selectedBulkColumn.type === 'select' && selectedBulkColumn.options ? (
                    <Select value={bulkValue} onValueChange={setBulkValue}>
                      <SelectTrigger className="h-8 rounded-lg w-48 text-sm">
                        <SelectValue placeholder="选择值" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedBulkColumn.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      placeholder={`输入${selectedBulkColumn.label}`}
                      className="h-8 rounded-lg w-48 text-sm"
                      type={selectedBulkColumn.type === 'number' ? 'number' : selectedBulkColumn.type === 'email' ? 'email' : 'text'}
                    />
                  )
                )}

                <Button
                  size="sm"
                  disabled={!bulkField || bulkValue === '' || bulkUpdateMutation.isPending}
                  onClick={handleBulkUpdateConfirm}
                  className="h-8 rounded-lg bg-brand hover:bg-brand-deep text-white disabled:opacity-40"
                >
                  确认更新
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowBulkUpdate(false)}
                  className="h-8 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <th className="px-4 py-3.5 text-left w-10">
                <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label="全选" />
              </th>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3.5 text-left">
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3.5 text-left w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2} className="h-48 text-center text-slate-400 font-medium">
                  加载中…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="h-48 text-center text-slate-400 font-medium">
                  暂无数据
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'transition-colors group',
                      isSelected ? 'bg-brand-light/30' : 'hover:bg-slate-50/80',
                      i !== data.length - 1 && 'border-b border-slate-50',
                      onRowClick && 'cursor-pointer',
                      rowClassName
                    )}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => toggleOne(row.id, !!checked)}
                        aria-label="选择"
                      />
                    </td>
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.rowId === row.id && editingCell?.field === col.key;

                      if (isEditing) {
                        return (
                          <td key={col.key} className="px-4 py-2 relative">
                            <div className="flex items-center gap-1">
                              {col.type === 'select' && col.options ? (
                                <Select value={editValue} onValueChange={setEditValue}>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {col.options.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : col.type === 'related' ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-slate-500">{editValue || '—'}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRelatedAnchor({ rowId: row.id, field: col.key, value: String((row as Record<string, unknown>)[col.key + 'Id'] ?? ''), label: String((row as Record<string, unknown>)[col.key] ?? ''), rect: new DOMRect() })}
                                    className="h-8 px-2 rounded-lg text-xs text-brand hover:bg-brand/10"
                                  >
                                    更改
                                  </Button>
                                </div>
                              ) : (
                                <Input
                                  ref={inputRef}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  onBlur={saveEdit}
                                  className="h-8 text-sm"
                                  type={col.type === 'number' ? 'number' : 'text'}
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  saveEdit();
                                }}
                                className="h-8 w-8 p-0 rounded-lg hover:bg-brand/10 hover:text-brand"
                              >
                                ✓
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  cancelEdit();
                                }}
                                className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:bg-slate-100"
                              >
                                ✕
                              </Button>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={cn('px-4 py-3.5', col.editable && 'cursor-text')}
                        >
                          <div className="flex items-center gap-1">
                            {col.editable && onUpdate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const val = (row as Record<string, unknown>)[col.key];
                                  startEdit(row.id, col.key, val, rect);
                                }}
                                className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-300 hover:text-brand hover:bg-brand/10 transition-all shrink-0"
                                title="点击编辑"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            )}
                            <span className="truncate">
                              {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRowClick?.(row)}
                          className="h-8 w-8 p-0 rounded-lg hover:bg-slate-100"
                        >
                          →
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {relatedAnchor && (
        <div className="fixed inset-0 z-40" onClick={() => setRelatedAnchor(null)} />
      )}
      {relatedAnchor && (
        <div
          className="fixed z-50 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/50 p-2"
          style={{
            top: relatedAnchor.rect.bottom + 4,
            left: relatedAnchor.rect.left,
          }}
        >
          <RelatedSelect
            value={relatedAnchor.value}
            relatedTo={columns.find((c) => c.key === relatedAnchor.field)?.relatedTo ?? ''}
            labelField={columns.find((c) => c.key === relatedAnchor.field)?.relatedLabelField ?? 'name'}
            onSelect={handleRelatedSelect}
            onClose={() => setRelatedAnchor(null)}
          />
        </div>
      )}
    </div>
  );
}
