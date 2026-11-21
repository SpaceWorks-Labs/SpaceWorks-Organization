"use client";

import { useMemo } from "react";
import { ScaledCard } from "@/components/cards/ScaledCard";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { normalizeCertificateSide } from "@/lib/certificates/design";
import { CERTIFICATE_LAYOUTS, certificateLayoutLayers, type CertificateLayoutId } from "@/lib/certificates/layouts";
import type { CertificatePage } from "@/lib/certificates/pages";
import { withCertificateText, type CertificateTextValues } from "@/lib/certificates/placeholders";

/** A layout's page: white, no background image, the layout's layers at this size. */
export function layoutSide(id: CertificateLayoutId, context: { organisationName: string }, page: CertificatePage, current: Pick<CardSideSettings, "widthMm" | "heightMm">): CardSideSettings {
  return normalizeCertificateSide({ backgroundColor: "white", gridSizeMm: 5, layers: certificateLayoutLayers(id, current.widthMm, current.heightMm) }, context, page);
}

/**
 * Ready-made layouts drawn with the sample member. Choosing one replaces every layer on the page (one undo step),
 * so a new design never starts blank and a muddled one can start again.
 */
export function LayoutPicker({ context, page, current, sample, branding, disabled, onChoose }: {
  context: { organisationName: string };
  page: CertificatePage;
  current: Pick<CardSideSettings, "widthMm" | "heightMm">;
  sample: { holder: CardHolder; values: CertificateTextValues };
  branding: CardBranding;
  disabled?: boolean;
  onChoose: (side: CardSideSettings) => void;
}) {
  const { widthMm, heightMm } = current;
  const sides = useMemo(
    () => CERTIFICATE_LAYOUTS.map((layout) => ({ ...layout, side: layoutSide(layout.id, context, page, { widthMm, heightMm }) })),
    [context, page, widthMm, heightMm],
  );
  return (
    <div role="group" aria-label="Ready-made layouts" className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
      {sides.map((layout) => (
        <button
          key={layout.id}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(layout.side)}
          className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-2 text-left transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-ink-muted motion-reduce:transition-none"
        >
          <span aria-hidden className="block overflow-hidden rounded-lg border border-line" style={{ aspectRatio: `${widthMm} / ${heightMm}` }}>
            <ScaledCard settings={withCertificateText(layout.side, sample.values)} holder={sample.holder} branding={branding} />
          </span>
          <span className="px-1 pb-1">
            <span className="block text-label font-semibold text-ink">Use {layout.label.toLowerCase()}</span>
            <span className="block text-caption text-ink-muted">{layout.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
