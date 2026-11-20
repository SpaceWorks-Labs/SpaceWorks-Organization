"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCardTemplate, listCardTemplates } from "@/app/actions/card-templates";
import { IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { CardDesign } from "@/lib/cards/design/presets";
import type { OrgCardTemplate } from "@/lib/cards/orgTemplates";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { ScaledCard } from "../../ScaledCard";
import { TEMPLATES_CHANGED_EVENT } from "./shared";

const TILE = "flex w-full flex-col items-center gap-1.5 rounded-2xl border border-line bg-canvas p-2 text-center transition-colors duration-(--sw-dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]";

/**
 * "Your templates": the organisation's own saved designs, above the built-in ones. Choosing one replaces both
 * sides (one undo step); deleting one leaves designs made from it alone.
 */
export function OrgTemplates({ organisationSlug, holder, branding, onChoose }: { organisationSlug: string; holder: CardHolder; branding: CardBranding; onChoose: (design: CardDesign) => void }) {
  const [templates, setTemplates] = useState<OrgCardTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OrgCardTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (result: Awaited<ReturnType<typeof listCardTemplates>>) => {
    if (result.ok) {
      setTemplates(result.data?.templates ?? []);
      setError(null);
    } else setError(result.error);
  };
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void listCardTemplates({ organisationSlug }).then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [organisationSlug, version]);

  useEffect(() => {
    const reload = () => setVersion((current) => current + 1);
    window.addEventListener(TEMPLATES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, reload);
  }, []);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const result = await deleteCardTemplate({ organisationSlug, templateId: removing.id });
    setBusy(false);
    if (!result.ok) setError(result.error);
    setRemoving(null);
    setVersion((current) => current + 1);
  };

  return (
    <section aria-labelledby="org-templates-heading" className="flex flex-col gap-2">
      <h3 id="org-templates-heading" className="text-label text-ink">Your templates</h3>
      {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
      {templates === null && !error ? <Spinner label="Loading your templates" className="size-5" /> : null}
      {templates && templates.length === 0 ? <p className="text-caption text-ink-muted">Save a design as an organisation template to reuse it here.</p> : null}
      {templates && templates.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 @md:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id} className="relative">
              <button type="button" onClick={() => onChoose(template.design)} className={TILE}>
                <span aria-hidden className="grid h-[84px] w-full place-items-center">
                  <span className="block" style={{ width: template.design.front.widthMm > template.design.front.heightMm ? 120 : 52 }}>
                    <ScaledCard settings={template.design.front} holder={holder} branding={branding} />
                  </span>
                </span>
                <span className="w-full truncate px-6 text-[14px] font-semibold leading-tight text-ink">{template.name}</span>
              </button>
              <IconButton label={`Delete template ${template.name}`} size="sm" variant="danger" className="absolute right-1 top-1" onClick={() => setRemoving(template)}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="pt-2 text-label text-ink">Built-in templates</h3>
      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this template?"
        message={removing ? `“${removing.name}” is removed from your templates. Designs already made from it stay as they are.` : undefined}
        confirmLabel="Delete template"
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
