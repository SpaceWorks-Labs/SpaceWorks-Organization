"use client";

import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { C, TARGET } from "./inspectorControls";

/**
 * Every colour used in the design, front and back, each with a colour picker that replaces it
 * everywhere in one step (fills, outlines, gradients, text, codes, the card's own colours).
 */
export function DesignColours({ colours, onReplace }: { colours: readonly string[]; onReplace: (from: string, to: string) => void }) {
  if (!colours.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption text-ink-muted">Choose a colour to change it everywhere in this design, on both sides.</p>
      <ul aria-label="Colours in this design" className="flex flex-col gap-1">
        {colours.map((hex, index) => (
          // Keyed by place, so the picker stays open while its colour changes under it.
          <li key={index}>
            <ColorPicker
              plain
              label={`${C.replaceColour.label} ${hex}`}
              value={hex}
              defaultColor={hex}
              onChange={(next) => next && next.toUpperCase() !== hex && onReplace(hex, next.toUpperCase())}
              trigger={
                <button type="button" aria-label={`${C.replaceColour.label} ${hex} everywhere`} className={cn(TARGET.picker, "flex w-full items-center gap-2 rounded-control border border-line bg-panel px-3 text-left text-[14px] text-ink hover:bg-muted")}>
                  <span aria-hidden className="size-5 shrink-0 rounded-full border border-line-strong" style={{ background: hex }} />
                  <span className="code-text flex-1 text-caption">{hex}</span>
                  <span className="text-caption text-ink-muted">Replace</span>
                </button>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
