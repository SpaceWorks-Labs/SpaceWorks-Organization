"use client";

import { Ban } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { BRAND } from "@/lib/cards/palette";

const QUICK = [BRAND.ink, BRAND.teal, BRAND.orange, BRAND.citron, BRAND.sky, BRAND.yellow, BRAND.cream, BRAND.white, "#000000"];

/**
 * Any colour: the brand colours and the organisation's accent one click away, everything else
 * through the colour picker. `allowNone` adds a "no colour" choice (a shape without a fill).
 */
export function ColourField({ label, value, onChange, orgAccent, allowNone = false }: { label: string; value: string | null; onChange: (hex: string | null) => void; orgAccent: string; allowNone?: boolean }) {
  const swatches = [...new Set([orgAccent.toUpperCase(), ...QUICK])];
  const chip = "size-7 shrink-0 rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption text-ink-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {allowNone ? (
          <button type="button" role="radio" aria-checked={value === null} aria-label="No colour" title="No colour" onClick={() => onChange(null)} className={cn(chip, "grid place-items-center bg-panel text-ink-muted", value === null && "ring-2 ring-primary ring-offset-1")}>
            <Ban aria-hidden className="size-4" />
          </button>
        ) : null}
        {swatches.map((hex) => (
          <button key={hex} type="button" role="radio" aria-checked={value === hex} aria-label={hex} title={hex === orgAccent.toUpperCase() ? `${hex} (organisation colour)` : hex} onClick={() => onChange(hex)} className={cn(chip, value === hex && "ring-2 ring-primary ring-offset-1")} style={{ background: hex }} />
        ))}
        <ColorPicker
          plain
          label={`${label}: your own colour`}
          value={value ?? ""}
          defaultColor={value ?? BRAND.ink}
          onChange={(hex) => onChange(hex ? hex.toUpperCase() : value)}
          trigger={
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-[14px] text-ink hover:bg-muted">
              <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: value ?? "transparent" }} />
              <span className="font-mono text-caption">{value ?? "None"}</span>
            </button>
          }
        />
      </div>
    </div>
  );
}
