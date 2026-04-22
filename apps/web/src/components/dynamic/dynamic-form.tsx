import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, genericApi } from '@/lib/api';
import { DynamicField, FieldDef } from './dynamic-field';
import { Button } from '@/components/ui/button';

export function DynamicRecordForm({
  objectApiName,
  recordId,
  initialData,
  onSuccess,
  onCancel,
}: {
  objectApiName: string;
  recordId?: string;
  initialData?: Record<string, any>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState<Record<string, any>>({});
  const [error, setError] = useState('');

  // 1. Fetch Object Metadata (Layout & Fields)
  const { data: metaResponse, isLoading: loadingMeta } = useQuery({
    queryKey: ['admin-object', objectApiName],
    queryFn: () => adminApi.getObject(objectApiName),
  });

  const objDef = metaResponse?.data ?? metaResponse;
  const fields: FieldDef[] = objDef?.fields ?? [];

  // Init data
  useEffect(() => {
    if (initialData) {
      setData((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  // 2. Fetch Existing Record Data (if Edit flow and no initialData)
  // Actually, since this is a generic form, the parent usually fetches the record and passes initialData.
  // We can just rely on `initialData` for now to keep it simple, or implement a generic fetch.

  // 3. Save Mutation
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      recordId
        ? genericApi.update(objectApiName, recordId, payload)
        : genericApi.create(objectApiName, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [objectApiName.toLowerCase()] });
      onSuccess();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? '保存失败';
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Pre-processing: split standard fields and custom fields
    const payload: Record<string, any> = {};
    const customData: Record<string, any> = data.customData ?? {};

    for (const f of fields) {
      const val = data[f.apiName];
      if (val !== undefined) {
        if (f.isCustom) {
          customData[f.apiName] = val;
        } else {
          payload[f.apiName] = val;
        }
      }
    }

    if (Object.keys(customData).length > 0) {
      payload.customData = customData;
    }

    saveMutation.mutate(payload);
  };

  if (loadingMeta) {
    return <div className="p-12 text-center text-slate-400">正在加载表单配置...</div>;
  }

  if (!objDef) {
    return <div className="p-12 text-center text-red-500">找不到对象配置：{objectApiName}</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4 pb-4">
        {fields
          .sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1)) // standard first
          .map((f) => (
            <DynamicField
              key={f.id}
              field={f}
              value={data[f.apiName]}
              onChange={(val) => setData((prev) => ({ ...prev, [f.apiName]: val }))}
            />
          ))}
      </div>

      {error && <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded border border-red-100">{error}</div>}

      <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saveMutation.isPending}>
          取消
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? '保存中...' : '确认'}
        </Button>
      </div>
    </form>
  );
}
