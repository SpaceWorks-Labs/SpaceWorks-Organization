"use client";

import { useId, useState, useTransition } from "react";
import { extractBrandColours, saveCardBrandKit, uploadBrandKitLogo } from "@/app/actions/brand-kit";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { BRAND_KIT_LIMITS, mergeColours, type CardBrandKit } from "@/lib/cards/brandKit";
import { BrandColours } from "./BrandColours";
import { BrandFonts } from "./BrandFonts";
import { BrandLogos } from "./BrandLogos";

/** Window event the card designer can listen for, so a saved kit shows up there without reloading the page. */
export const BRAND_KIT_EVENT = "swo:card-brand-kit";

const same = (a: CardBrandKit, b: CardBrandKit) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The organisation's brand kit on Settings → Cards: logo variants, colours (picked from a logo or typed) with
 * contrast hints, and preferred card fonts. Changes are kept until "Save brand kit"; a logo variant is stored
 * and added as soon as it uploads.
 */
export function BrandKitPanel({ organisationSlug, currentLogoUrl, initialKit, canEdit }: {
  organisationSlug: string;
  currentLogoUrl: string | null;
  initialKit: CardBrandKit;
  canEdit: boolean;
}) {
  const titleId = useId();
  const { showToast } = useToast();
  const [saved, setSaved] = useState(initialKit);
  const [kit, setKit] = useState(initialKit);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, startSaving] = useTransition();
  const [extracting, startExtracting] = useTransition();
  const [uploading, startUploading] = useTransition();
  const dirty = !same(kit, saved);
  const busy = !canEdit || saving;
  useUnsavedChangesGuard(dirty && !saving);

  const fail = (message: string) => {
    setError(message);
    showToast(message, "error");
  };

  // The designer is offered the current logo first, as the page loads it (lib/cards/brandKitData.ts).
  const publish = (next: CardBrandKit) => {
    const logos = [...new Set([...(currentLogoUrl ? [currentLogoUrl] : []), ...next.logos])];
    window.dispatchEvent(new CustomEvent(BRAND_KIT_EVENT, { detail: { ...next, logos } }));
  };

  function extract(logoUrl: string | null) {
    setError(null);
    startExtracting(async () => {
      const result = await extractBrandColours({ organisationSlug, logoUrl });
      if (!result.ok) return fail(result.error);
      const found = result.data?.colours ?? [];
      const next = mergeColours(kit, found);
      const added = next.colours.length - kit.colours.length;
      setKit(next);
      setStatus(added ? `Added ${added} ${added === 1 ? "colour" : "colours"} from the logo. Save to keep them.` : next.colours.length >= BRAND_KIT_LIMITS.colours ? "The kit is full, so no colours were added." : "Those colours are already in the kit.");
    });
  }

  function upload(file: File) {
    setError(null);
    startUploading(async () => {
      const form = new FormData();
      form.set("organisationSlug", organisationSlug);
      form.set("file", file);
      const result = await uploadBrandKitLogo(form);
      if (!result.ok || !result.data) return fail(result.ok ? "The logo didn't upload. Try again." : result.error);
      const logos = result.data.kit.logos;
      setKit((current) => ({ ...current, logos }));
      setSaved((current) => ({ ...current, logos }));
      publish({ ...saved, logos });
      setStatus("Logo variant added.");
    });
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveCardBrandKit({ organisationSlug, kit });
      if (!result.ok || !result.data) return fail(result.ok ? "The brand kit didn't save. Try again." : result.error);
      setKit(result.data.kit);
      setSaved(result.data.kit);
      publish(result.data.kit);
      setStatus("");
      showToast("Brand kit saved", "success");
    });
  }

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 id={titleId} className="text-h4 text-ink">Brand kit</h2>
        <p className="mt-0.5 text-body-ui text-ink-muted">Your logos, colours and fonts, offered first whenever you design a card.</p>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-6 pt-5 sm:px-6">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="grid gap-6 lg:grid-cols-3">
          <BrandLogos
            organisationSlug={organisationSlug}
            currentLogoUrl={currentLogoUrl}
            logos={kit.logos}
            disabled={busy || extracting}
            uploading={uploading}
            onUpload={upload}
            onRemove={(url) => setKit((current) => ({ ...current, logos: current.logos.filter((item) => item !== url) }))}
            onExtract={extract}
          />
          <BrandColours colours={kit.colours} disabled={busy} extracting={extracting} canExtract={Boolean(currentLogoUrl)} onChange={(colours) => setKit((current) => ({ ...current, colours }))} onExtract={() => extract(currentLogoUrl)} />
          <BrandFonts fonts={kit.fonts} disabled={busy} onChange={(fonts) => setKit((current) => ({ ...current, fonts }))} />
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-subtle px-5 py-3.5 sm:px-6">
          <span role="status" className="min-w-0 flex-1 text-sm text-ink-secondary">
            {status || (dirty ? "You have unsaved changes" : "")}
          </span>
          <Button variant="quiet" disabled={!dirty || saving} onClick={() => { setKit(saved); setStatus(""); setError(null); }}>
            Discard
          </Button>
          <Button variant="primary" disabled={!dirty} loading={saving} loadingLabel="Saving" onClick={save}>
            Save brand kit
          </Button>
        </div>
      ) : null}
    </section>
  );
}
