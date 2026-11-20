"use client";

import { Columns2, CopyPlus, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardSide } from "@/lib/cards/design/presets";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { CardCanvas } from "../../CardCanvas";

const NAME: Record<CardSide, string> = { front: "front", back: "back" };

/**
 * Working across both sides: show them side by side (wide screens), copy this side's layout onto the
 * other, or duplicate this side onto it. Each copy is one undo step.
 */
export function SideTools({ side, both, onBoth, onCopyLayout, onDuplicate }: { side: CardSide; both: boolean; onBoth: (on: boolean) => void; onCopyLayout: () => void; onDuplicate: () => void }) {
  const other = side === "front" ? "back" : "front";
  return (
    <div role="toolbar" aria-label="Both sides" className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant={both ? "primary" : "quiet"} startIcon={<Columns2 />} aria-pressed={both} className="hidden xl:inline-flex" onClick={() => onBoth(!both)}>Both sides</Button>
      <Button size="sm" variant="quiet" startIcon={<LayoutTemplate />} title={`Puts this side's layers and item positions on the ${NAME[other]}; its words and colours stay.`} onClick={onCopyLayout}>Copy layout to the {NAME[other]}</Button>
      <Button size="sm" variant="quiet" startIcon={<CopyPlus />} title={`Replaces the ${NAME[other]} with a copy of this side. Undo brings it back.`} onClick={onDuplicate}>Duplicate onto the {NAME[other]}</Button>
    </div>
  );
}

/** The side not being edited, drawn as a static preview; choosing it makes it the side being edited. */
export function InactiveSide({ side, settings, holder, branding, pxPerMm, onActivate }: { side: CardSide; settings: CardSideSettings; holder: CardHolder; branding: CardBranding; pxPerMm: number; onActivate: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Edit the ${NAME[side]}`}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onActivate}
      className="rounded-md opacity-80 outline-offset-4 transition-opacity duration-(--sw-dur-fast) hover:opacity-100 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
    >
      <CardCanvas settings={settings} holder={holder} branding={branding} pxPerMm={pxPerMm} />
      <span className="mt-2 block text-caption text-ink-muted">{side === "front" ? "Front" : "Back"}: choose to edit</span>
    </button>
  );
}
