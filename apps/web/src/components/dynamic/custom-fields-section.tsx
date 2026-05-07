'use client';
// ─── <CustomFieldsSection> ────────────────────────────────────────────────
// Drops into any standard create/edit modal so admin-defined custom fields
// (added via /admin/metadata) appear inline alongside the built-in fields.
//
// Usage:
//
//   const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
//   const customRef = useRef<{ validate: () => boolean }>(null);
//   ...
//   <CustomFieldsSection
//     ref={customRef}
//     objectApiName="Lead"
//     value={customFields}
//     onChange={setCustomFields}
//   />
//   ...
//   onSubmit:
//     if (customRef.current && !customRef.current.validate()) return;
//     payload.customFields = customFields;
//
// Hides itself when the object has no custom fields.

import { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { DynamicField, validateField, type FieldDef } from './dynamic-field';
import { Sparkles } from 'lucide-react';

interface Props {
  objectApiName: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Optional initial values from the existing record (for edit mode). */
  initial?: Record<string, unknown> | null;
}

export interface CustomFieldsSectionHandle {
  validate: () => boolean;
}

export const CustomFieldsSection = forwardRef<CustomFieldsSectionHandle, Props>(
  function CustomFieldsSection({ objectApiName, value, onChange, initial }, ref) {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { data: objMeta } = useQuery({
      queryKey: ['admin-object', objectApiName],
      queryFn: () => adminApi.getObject(objectApiName),
      staleTime: 5 * 60 * 1000,
    });

    const obj = objMeta?.data ?? objMeta;
    const customDefs: FieldDef[] = (obj?.fields ?? []).filter((f: FieldDef) => f.isCustom);

    // On first render with initial data, seed it once.
    useEffect(() => {
      if (initial && Object.keys(value).length === 0 && Object.keys(initial).length > 0) {
        onChange({ ...initial });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial]);

    useImperativeHandle(ref, () => ({
      validate: () => {
        const errs: Record<string, string> = {};
        for (const f of customDefs) {
          if (f.type === 'FORMULA') continue;
          const e = validateField(f, value[f.apiName]);
          if (e) errs[f.apiName] = e;
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
      },
    }));

    if (customDefs.length === 0) return null;

    return (
      <div className="space-y-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
          <Sparkles size={10} className="text-violet-500" />
          自定义字段
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">{customDefs.length} 项</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {customDefs.map((f) => (
            <DynamicField
              key={f.id}
              field={f}
              value={value[f.apiName]}
              onChange={(val) => onChange({ ...value, [f.apiName]: val })}
              errorOverride={errors[f.apiName]}
            />
          ))}
        </div>
      </div>
    );
  },
);
