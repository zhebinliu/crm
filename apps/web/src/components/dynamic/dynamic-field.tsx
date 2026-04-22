import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LookupSelect } from "./lookup-select";

export type FieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'EMAIL' | 'PHONE' | 'URL' | 'PICKLIST' | 'REFERENCE';

export interface FieldDef {
  id: string;
  apiName: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  isSystem: boolean;
  isCustom: boolean;
  picklistId?: string;
  referenceTo?: string;
}

export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
}) {
  const lbl = field.label;

  switch (field.type) {
    case 'TEXT':
    case 'EMAIL':
    case 'PHONE':
    case 'URL':
      return (
        <div className="space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <Input
            required={field.required}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-9"
          />
          {field.required && !value && <span className="text-[10px] text-danger">必填项</span>}
        </div>
      );
    case 'NUMBER':
    case 'CURRENCY':
    case 'PERCENT':
      return (
        <div className="space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <Input
            type="number"
            required={field.required}
            value={value || ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className="h-9"
          />
        </div>
      );
    case 'TEXTAREA':
      return (
        <div className="col-span-2 space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <Textarea
            required={field.required}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
      );
    case 'BOOLEAN':
      return (
        <div className="flex items-center space-x-2 h-9 self-end pb-2">
          <Checkbox
            id={field.id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <Label
            htmlFor={field.id}
            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-ink-secondary"
          >
            {lbl}
          </Label>
        </div>
      );
    case 'DATE':
    case 'DATETIME':
      return (
        <div className="space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <Input
            type={field.type === 'DATE' ? 'date' : 'datetime-local'}
            required={field.required}
            value={value ? new Date(value).toISOString().slice(0, field.type === 'DATE' ? 10 : 16) : ''}
            onChange={(e) => onChange(new Date(e.target.value).toISOString())}
            className="h-9"
          />
        </div>
      );
    case 'PICKLIST':
      return (
        <div className="space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <Input
            required={field.required}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="下拉框 (输入文本暂代)"
            className="h-9"
          />
        </div>
      );
    case 'REFERENCE':
      return (
        <div className="space-y-2">
          <Label className="text-xs text-ink-secondary">{lbl}</Label>
          <LookupSelect 
             objectApiName={field.referenceTo || 'Account'} 
             label={lbl}
             value={value}
             onChange={onChange}
          />
        </div>
      );
    default:
      return null;
  }
}

