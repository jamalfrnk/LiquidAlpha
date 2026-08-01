import { useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Off-canvas nav for <lg viewports. Built on the same Radix Dialog
 * primitive as components/ui/dialog.tsx (not reused directly -- that
 * component is centered/modal-styled; this is a left-anchored panel), which
 * gets focus-trap, Escape-to-close, and focus-restoration-on-close for
 * free instead of hand-rolling them.
 */
export function MobileNavDrawer({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-bg-floating hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border-subtle',
            'bg-bg-elevated shadow-floating focus:outline-none data-[state=open]:animate-slide-in-left lg:hidden',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
          {/* Passing the setter down lets nav links close the drawer on
              navigate -- Radix only closes on overlay click/Escape/trigger
              by default, not on arbitrary content clicks. */}
          {children(() => setOpen(false))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
