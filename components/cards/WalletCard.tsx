"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardDesign } from "@/lib/cards/design/presets";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { CardFontFaces } from "./cardFonts";
import { HolographicCard } from "./HolographicCard";
import { ScaledCard } from "./ScaledCard";

/**
 * One card to hold: the holographic viewer plus PDF and PNG downloads and the public check page.
 * Used on the member detail page, and by the member portal's wallet with a WalletCard from
 * lib/cards/wallet.ts (pass its design, holder, branding, downloads and verifyPath).
 */
export function WalletCard({
  design,
  holder,
  branding,
  label,
  downloads,
  verifyPath,
  celebrate = false,
}: {
  design: CardDesign;
  holder: CardHolder;
  branding: CardBranding;
  label: string;
  /** Null hides the PDF and PNG links (staff who may not download cards). */
  downloads: { pdf: string; pngFront: string; pngBack: string | null } | null;
  verifyPath: string;
  celebrate?: boolean;
}) {
  const back = design.backEnabled ? design.back : null;
  return (
    <div className="flex flex-col gap-4">
      <CardFontFaces />
      <HolographicCard
        label={label}
        widthMm={design.front.widthMm}
        heightMm={design.front.heightMm}
        celebrate={celebrate}
        front={<ScaledCard settings={design.front} holder={holder} branding={branding} />}
        back={back ? <ScaledCard settings={back} holder={holder} branding={branding} /> : null}
      />
      <div className="flex flex-wrap justify-center gap-2">
        {downloads ? (
          <>
            <Button asChild size="sm" variant="primary">
              <a href={downloads.pdf} download><Download aria-hidden className="size-4" />PDF{back ? " (front and back)" : ""}</a>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a href={downloads.pngFront} download><Download aria-hidden className="size-4" />PNG</a>
            </Button>
          </>
        ) : null}
        <Button asChild size="sm" variant="quiet">
          <a href={verifyPath} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="size-4" />Check page<span className="sr-only"> (opens in a new tab)</span></a>
        </Button>
      </div>
    </div>
  );
}
