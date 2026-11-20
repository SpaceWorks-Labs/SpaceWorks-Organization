"use client";

import { useState } from "react";
import { copyLogoToCardArtwork } from "@/app/actions/card-artwork";
import { Callout } from "@/components/ui/display";

/** Width over height of a picture at `url`, or 1 when it can't be read. */
function urlAspect(url: string) {
  return new Promise<number>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1);
    image.onerror = () => resolve(1);
    image.src = url;
  });
}

/**
 * The brand kit's logos as tiles. Choosing one copies it into the organisation's card artwork (cards
 * only draw that) and places it on the card, keeping its proportions.
 */
export function BrandLogos({ organisationSlug, logos, disabled, onPlace }: { organisationSlug: string; logos: string[]; disabled: boolean; onPlace: (url: string, aspect: number) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (logos.length === 0) return null;
  const place = async (logoUrl: string) => {
    setBusy(logoUrl);
    setError(null);
    try {
      const result = await copyLogoToCardArtwork({ organisationSlug, logoUrl });
      if (result.ok && result.data) onPlace(result.data.url, await urlAspect(result.data.url));
      else if (!result.ok) setError(result.error);
    } catch {
      setError("The logo couldn't be added. Try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-label="Brand logos" className="flex flex-col gap-1.5">
      <p className="text-caption font-semibold text-ink-muted">Brand logos</p>
      <div className="flex flex-wrap gap-1.5">
        {logos.map((logo, index) => (
          <button key={logo} type="button" disabled={disabled || busy !== null} aria-busy={busy === logo} onClick={() => void place(logo)} className="grid size-16 place-items-center rounded-lg border border-line bg-panel p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] disabled:cursor-not-allowed disabled:opacity-50">
            {/* eslint-disable-next-line @next/next/no-img-element -- the organisation's own logo upload */}
            <img src={logo} alt={`Add logo ${index + 1} to the card`} className="max-h-full max-w-full object-contain" />
          </button>
        ))}
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    </section>
  );
}
