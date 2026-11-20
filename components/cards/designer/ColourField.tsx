"use client";

import type { ReactNode } from "react";
import { Ban, Check, Pipette } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { BRAND } from "@/lib/cards/palette";
import { useEyedropper } from "./inspector/useEyedropper";

/** Dark check on light swatches, light check on dark ones (relative luminance, sRGB approximation). */
function checkTone(hex: string) {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? BRAND.ink : BRAND.white;
}

const QUICK = [BRAND.ink, BRAND.teal, BRAND.orange, BRAND.citron, BRAND.sky, BRAND.yellow, BRAND.cream, BRAND.white, "#000000"];
const DOCUMENT_MAX = 12;
/** 44px targets with a smaller swatch inside, so a row of colours stays compact. */
const CHIP = "grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--sw-ui-focus))]";
const SWATCH = "grid size-8 place-items-center rounded-full border border-line-strong forced-colors:border-[ButtonText]";
const upper = (list: readonly string[] | undefined) => [...new Set((list ?? []).map((hex) => hex.toUpperCase()).filter((hex) => /^#[0-9A-F]{6}$/.test(hex)))];

function Swatches({ label, colours, value, title, onChange, children }: { label: string; colours: string[]; value: string | null; title: (hex: string) => string; onChange: (hex: string) => void; children?: ReactNode }) {
  if (!colours.length && !children) return null;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center">
      {children}
      {colours.map((hex) => (
        <button key={hex} type="button" role="radio" aria-checked={value === hex} aria-label={title(hex)} title={title(hex)} onClick={() => onChange(hex)} className={CHIP}>
          <span aria-hidden className={cn(SWATCH, value === hex && "ring-2 ring-primary ring-offset-1 forced-colors:border-2")} style={{ background: hex }}>
            {value === hex ? <Check strokeWidth={3} className="size-4" style={{ color: checkTone(hex) }} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Any colour: the brand kit's colours, the colours already in this design, the Space Works colours
 * and the organisation's accent one click away, a colour picked from the screen, and everything else
 * through the colour picker. `allowNone` adds a "no colour" choice (a shape without a fill). The
 * chosen swatch shows a check mark as well as the ring, so the choice survives forced colours.
 */
export function ColourField({ label, value, onChange, orgAccent, allowNone = false, brandColours, documentColours }: {
  label: string;
  value: string | null;
  onChange: (hex: string | null) => void;
  orgAccent: string;
  allowNone?: boolean;
  /** The organisation's brand kit colours, shown first. */
  brandColours?: readonly string[];
  /** Every colour the design already uses (`documentColours` in lib/cards/design/library/colours.ts). */
  documentColours?: readonly string[];
}) {
  const brand = upper(brandColours);
  const used = upper(documentColours).filter((hex) => !brand.includes(hex)).slice(0, DOCUMENT_MAX);
  const quick = [...new Set([orgAccent.toUpperCase(), ...QUICK])].filter((hex) => !brand.includes(hex) && !used.includes(hex));
  const dropper = useEyedropper((hex) => onChange(hex));
  const caption = (text: string) => <p className="text-caption text-ink-muted">{text}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-ink-muted">{label}</p>
      {brand.length ? caption("Brand colours") : null}
      <Swatches label={`${label}: brand colours`} colours={brand} value={value} title={(hex) => `${hex} (brand colour)`} onChange={onChange} />
      {used.length ? caption("Document colours") : null}
      <Swatches label={`${label}: document colours`} colours={used} value={value} title={(hex) => `${hex} (in this design)`} onChange={onChange} />
      {brand.length || used.length ? caption("More colours") : null}
      <Swatches label={`${label}: quick colours`} colours={quick} value={value} title={(hex) => (hex === orgAccent.toUpperCase() ? `${hex} (organisation colour)` : hex)} onChange={onChange}>
        {allowNone ? (
          <button type="button" role="radio" aria-checked={value === null} aria-label="No colour" title="No colour" onClick={() => onChange(null)} className={CHIP}>
            <span aria-hidden className={cn(SWATCH, "bg-panel text-ink-muted", value === null && "ring-2 ring-primary ring-offset-1 forced-colors:border-2")}>
              {value === null ? <Check strokeWidth={3} className="size-4 text-ink" /> : <Ban className="size-4" />}
            </span>
          </button>
        ) : null}
      </Swatches>
      <div className="flex flex-wrap items-center gap-1.5">
        <ColorPicker
          plain
          label={`${label}: your own colour`}
          value={value ?? ""}
          defaultColor={value ?? BRAND.ink}
          onChange={(hex) => onChange(hex ? hex.toUpperCase() : value)}
          trigger={
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line bg-panel px-3 text-[14px] text-ink hover:bg-muted">
              <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: value ?? "transparent" }} />
              <span className="code-text text-caption">{value ?? "None"}</span>
            </button>
          }
        />
        <button type="button" aria-pressed={dropper.picking} aria-label={`${label}: pick a colour from the screen`} title="Pick a colour from the screen" onClick={() => void dropper.pick()} className={cn("inline-flex size-11 items-center justify-center rounded-control border border-line bg-panel text-ink hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]", dropper.picking && "border-primary bg-subtle")}>
          <Pipette aria-hidden className="size-4" />
        </button>
      </div>
      <p aria-live="polite" className="text-caption text-ink-muted">{dropper.picking ? "Click a colour on the card to pick it. Esc cancels." : ""}</p>
    </div>
  );
}
