import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DynamicRecordForm } from './dynamic-form';
import { getObjectIcon } from '@/lib/object-icons';

interface CreateRecordModalProps {
  open: boolean;
  onClose: () => void;
  objectApiName: string;
  recordId?: string; // If provided, it's an edit modal
  initialData?: Record<string, any>;
  onSuccess?: () => void;
  title?: string;
}

export function CreateRecordModal({
  open,
  onClose,
  objectApiName,
  recordId,
  initialData,
  onSuccess,
  title,
}: CreateRecordModalProps) {
  const Icon = getObjectIcon(objectApiName);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-7 pt-7 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-ink flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand/10 text-brand">
              <Icon size={20} />
            </div>
            {title || (recordId ? `编辑${objectApiName}` : `新建${objectApiName}`)}
          </DialogTitle>
        </DialogHeader>

        <div className="px-7 py-6 max-h-[70vh] overflow-y-auto">
          <DynamicRecordForm
            objectApiName={objectApiName}
            recordId={recordId}
            initialData={initialData}
            onSuccess={() => {
              onSuccess?.();
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
