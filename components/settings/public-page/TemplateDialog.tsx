"use client";

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { documentHasContent, PAGE_TEMPLATES, templateDocument, type TemplateId } from "@/lib/publicPage/templates";
import type { PageDocument } from "@/lib/publicPage/sections";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";

type TemplateOrg = { name: string; description: string; contactEmail: string | null; contactPhone: string | null };

/**
 * Start from a template: a starting layout with placeholder copy to make your own. It only changes the editor; a
 * page with content asks before its sections are replaced, and visitors see nothing until you publish.
 */
export function TemplatePicker({ document, org, disabled, onApply }: { document: PageDocument; org: TemplateOrg; disabled: boolean; onApply: (next: PageDocument, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<TemplateId | null>(null);
  const chosen = PAGE_TEMPLATES.find((template) => template.id === pending);

  const apply = (id: TemplateId) => {
    const template = PAGE_TEMPLATES.find((one) => one.id === id)!;
    onApply(templateDocument(id, document, org), template.label);
    setPending(null);
    setOpen(false);
  };
  const choose = (id: TemplateId) => {
    if (documentHasContent(document)) return setPending(id);
    apply(id);
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <LayoutTemplate aria-hidden className="size-4" />Start from a template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader title="Start from a template" description="A starting layout with placeholder text to make your own. Your accent colour and cover stay." />
          <DialogBody className="pb-6">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PAGE_TEMPLATES.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => choose(template.id)}
                    className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-lg border border-line bg-panel px-4 py-3 text-left transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted"
                  >
                    <span className="text-label font-semibold text-ink">{template.label}</span>
                    <span className="text-caption text-ink-muted">{template.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(chosen)}
        title={`Replace your sections with the ${chosen?.label ?? ""} template?`}
        message="Your accent colour and cover stay. Nothing changes for visitors until you publish."
        confirmLabel="Replace sections"
        onCancel={() => setPending(null)}
        onConfirm={() => pending && apply(pending)}
      />
    </>
  );
}
