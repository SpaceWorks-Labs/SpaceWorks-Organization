"use client";

import { useState, type FormEvent } from "react";
import { saveCardTemplate } from "@/app/actions/card-templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import type { CardDesign } from "@/lib/cards/design/presets";
import { CARD_TEMPLATE_NAME_MAX } from "@/lib/cards/orgTemplates";
import { announceTemplatesChanged, keepKeysInside } from "./shared";

/** Save both sides of the design as one of the organisation's own templates, offered in Templates. */
export function SaveTemplateDialog({ open, onOpenChange, organisationSlug, design, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; organisationSlug: string; design: CardDesign; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveCardTemplate({ organisationSlug, name, design });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    announceTemplatesChanged();
    onSaved(result.data?.template.name ?? name.trim());
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm" onKeyDown={keepKeysInside}>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-col">
          <DialogHeader title="Save as organisation template" description="Both sides are saved. Anyone who designs cards here can start from it under Templates." />
          <DialogBody>
            <Field label="Template name" error={error ?? undefined} helperText={`Up to ${CARD_TEMPLATE_NAME_MAX} characters.`}>
              <Input value={name} maxLength={CARD_TEMPLATE_NAME_MAX} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => close(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving} loadingLabel="Saving">Save template</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
