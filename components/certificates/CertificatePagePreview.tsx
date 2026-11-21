"use client";

import { ScaledCard } from "@/components/cards/ScaledCard";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { withCertificateText, type CertificateTextValues } from "@/lib/certificates/placeholders";

/** A certificate page drawn to the width of its container with the sample member, for read-only views. */
export function CertificatePagePreview({ side, holder, values, branding, label }: { side: CardSideSettings; holder: CardHolder; values: CertificateTextValues; branding: CardBranding; label: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <div role="img" aria-label={label} className="overflow-hidden rounded-xl border border-line bg-subtle" style={{ aspectRatio: `${side.widthMm} / ${side.heightMm}` }}>
        <ScaledCard settings={withCertificateText(side, values)} holder={holder} branding={branding} />
      </div>
      <figcaption className="text-caption text-ink-muted">Drawn with sample details.</figcaption>
    </figure>
  );
}
