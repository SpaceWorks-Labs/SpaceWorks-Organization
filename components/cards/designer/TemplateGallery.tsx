"use client";

import { useMemo } from "react";
import type { CardDesignContext } from "@/lib/cards/design/normalize";
import type { CardDesign } from "@/lib/cards/design/presets";
import { CARD_TEMPLATE_INFO, CARD_TEMPLATES, cardTemplateDesign, type CardTemplateId } from "@/lib/cards/design/templates";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { ScaledCard } from "../ScaledCard";
import { OrgTemplates } from "./extras/OrgTemplates";

/**
 * Ready-made designs, each previewed with the sample member. Choosing one replaces both sides; undo brings the old design back.
 * Given `organisationSlug` and `onChooseDesign`, the organisation's own templates come first ("Your templates").
 */
export function TemplateGallery({ context, holder, branding, onChoose, organisationSlug, onChooseDesign }: { context: CardDesignContext; holder: CardHolder; branding: CardBranding; onChoose: (id: CardTemplateId) => void; organisationSlug?: string; onChooseDesign?: (design: CardDesign) => void }) {
  const designs = useMemo(() => CARD_TEMPLATES.map((id) => ({ id, design: cardTemplateDesign(id, context) })), [context]);
  return (
    <div className="@container flex flex-col gap-2">
      {organisationSlug && onChooseDesign ? <OrgTemplates organisationSlug={organisationSlug} holder={holder} branding={branding} onChoose={onChooseDesign} /> : null}
      <ul className="grid grid-cols-2 gap-2 @md:grid-cols-3">
        {designs.map(({ id, design }) => (
          <li key={id}>
            <button type="button" onClick={() => onChoose(id)} title={CARD_TEMPLATE_INFO[id].hint} className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-line bg-canvas p-2 text-center transition-colors duration-(--sw-dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]">
              <span aria-hidden className="grid h-[84px] w-full place-items-center">
                <span className="block" style={{ width: design.front.widthMm > design.front.heightMm ? 120 : 52 }}>
                  <ScaledCard settings={design.front} holder={holder} branding={branding} />
                </span>
              </span>
              <span className="text-[14px] font-semibold leading-tight text-ink">{CARD_TEMPLATE_INFO[id].label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
