'use client';
// Floating button (bottom-right) that opens the Copilot panel. Lives in the
// (crm) layout so it's available on every CRM page.

import { useEffect, useState } from 'react';
import { CopilotPanel } from './copilot-panel';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CopilotTrigger() {
  const [open, setOpen] = useState(false);

  // Cmd/Ctrl + K shortcut to toggle the copilot.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-6 right-6 z-30',
            'flex items-center gap-2 h-12 px-5 rounded-full',
            'bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600',
            'text-white text-sm font-black',
            'shadow-2xl shadow-violet-300/50 hover:shadow-violet-400/60',
            'transition-all hover:-translate-y-0.5',
          )}
          title="AI 助手 (⌘K)"
        >
          <Sparkles size={16} />
          <span className="hidden sm:inline">问小销</span>
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/90 font-mono">⌘K</kbd>
        </button>
      )}
      <CopilotPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
