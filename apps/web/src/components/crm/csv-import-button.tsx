'use client';
// ─── <CsvImportButton> ────────────────────────────────────────────────────
// Button that opens a file picker, reads the CSV as text on the client, and
// POSTs it to /admin/import/:objectApiName. Shows a results dialog with
// per-row errors so users can fix and re-upload.

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importApi } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportResult {
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string; values: Record<string, string> }>;
  recognizedHeaders: string[];
  ignoredHeaders: string[];
}

interface Props {
  objectApiName: 'Lead' | 'Account' | 'Contact' | 'Opportunity';
  /** Plain-Chinese label for the result dialog title. */
  objectLabel: string;
  /** Optional invalidate keys for the parent list query. */
  invalidateKeys?: string[];
}

export function CsvImportButton({ objectApiName, objectLabel, invalidateKeys }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filename, setFilename] = useState<string>('');

  const importMut = useMutation({
    mutationFn: (csv: string) => importApi.importCsv(objectApiName, csv) as Promise<ImportResult>,
    onSuccess: (r) => {
      setResult(r);
      setResultOpen(true);
      if (r.created > 0 && invalidateKeys) {
        qc.invalidateQueries({ queryKey: invalidateKeys });
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
        ?? (err as { message?: string }).message ?? '导入失败';
      setResult({
        total: 0, created: 0, failed: 0,
        errors: [{ row: 0, message: msg, values: {} }],
        recognizedHeaders: [], ignoredHeaders: [],
      });
      setResultOpen(true);
    },
  });

  function pick() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      alert('文件超过 5MB 上限。');
      return;
    }
    setFilename(f.name);
    f.text().then((csv) => importMut.mutate(csv));
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-xl border-slate-200 font-bold gap-1.5 px-3 text-xs"
        onClick={pick}
        disabled={importMut.isPending}
      >
        {importMut.isPending
          ? <Loader2 size={13} className="animate-spin" />
          : <Upload size={13} />}
        导入 CSV
      </Button>

      <Dialog open={resultOpen} onOpenChange={(v) => !v && setResultOpen(false)}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center',
                result && result.failed === 0
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-amber-100 text-amber-600',
              )}>
                {result && result.failed === 0 ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
              </div>
              导入{objectLabel}结果
            </DialogTitle>
          </DialogHeader>

          {result && (
            <div className="space-y-4 mt-3 max-h-[70vh] overflow-y-auto pr-1">
              {filename && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <FileText size={13} />
                  <span>{filename}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Stat label="总行数" value={String(result.total)} accent="bg-slate-100 text-slate-600" />
                <Stat label="成功" value={String(result.created)} accent="bg-emerald-50 text-emerald-700" />
                <Stat label="失败" value={String(result.failed)} accent={result.failed > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400'} />
              </div>

              {result.recognizedHeaders.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    识别字段（{result.recognizedHeaders.length}）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.recognizedHeaders.map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-mono font-bold">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.ignoredHeaders.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    忽略的列（{result.ignoredHeaders.length}）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.ignoredHeaders.map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-mono">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-red-600 uppercase tracking-wider mb-2">
                    错误明细（{result.errors.length}）
                  </p>
                  <div className="rounded-2xl border border-red-100 bg-red-50/40 max-h-72 overflow-auto divide-y divide-red-100">
                    {result.errors.slice(0, 100).map((e, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 font-bold text-red-700">
                          <span>第 {e.row} 行</span>
                          <X size={11} />
                          <span>{e.message}</span>
                        </div>
                        {Object.keys(e.values).length > 0 && (
                          <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                            {Object.entries(e.values).slice(0, 4).map(([k, v]) => `${k}="${v}"`).join('  ')}
                          </div>
                        )}
                      </div>
                    ))}
                    {result.errors.length > 100 && (
                      <div className="px-3 py-2 text-xs font-bold text-slate-400">
                        … 还有 {result.errors.length - 100} 条错误未显示
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setResultOpen(false)} className="rounded-xl font-bold">
                  完成
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={cn('p-3 rounded-2xl', accent)}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-black tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  );
}
