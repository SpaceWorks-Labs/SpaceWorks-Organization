"use client";

import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { SHORTCUTS } from "./shortcuts";

/** The designer's keyboard shortcuts, opened with ? or the toolbar's keyboard button. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title="Keyboard shortcuts" description="On a Mac, use Cmd where it says Ctrl. Shortcuts work when you're not typing in a field." />
        <DialogBody className="pb-6">
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2 text-body-ui">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="contents">
                <dt><kbd className="whitespace-nowrap rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-caption text-ink">{shortcut.keys}</kbd></dt>
                <dd className="text-ink-secondary">{shortcut.label}</dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
