"use client";

import { cn } from "@/lib/cn";
import { CARD_PRESET_INFO, CARD_PRESETS, type CardPreset } from "@/lib/cards/design/presets";

/** Tiny drawings of each preset: card colour, band or frame, photo block and QR corner. */
const THUMBS: Record<CardPreset, { card: string; band: string; frame: boolean; portrait: boolean }> = {
  community: { card: "bg-sw-cream", band: "", frame: true, portrait: false },
  corporate: { card: "bg-white", band: "bg-sw-ink", frame: false, portrait: true },
  night: { card: "bg-sw-ink", band: "bg-sw-citron", frame: false, portrait: true },
  student: { card: "bg-white", band: "bg-sw-sky", frame: false, portrait: false },
};

function Thumb({ preset }: { preset: CardPreset }) {
  const look = THUMBS[preset];
  const dark = preset === "night";
  return (
    <span aria-hidden className={cn("relative block overflow-hidden rounded-[4px] outline outline-1 outline-line", look.card, look.portrait ? "h-[52px] w-[33px]" : "h-[33px] w-[52px]")}>
      {look.frame ? <span className="absolute inset-[2px] rounded-[2px] border border-sw-teal" /> : null}
      {look.band ? <span className={cn("absolute inset-x-[2px] top-[2px] block h-[8px] rounded-[1.5px]", look.band)} /> : null}
      <span className={cn("absolute left-[5px] block rounded-[2px]", dark ? "bg-sw-cream/70" : "bg-sw-teal/50", look.portrait ? "top-[13px] size-[11px]" : "top-[12px] size-[10px]")} />
      <span className={cn("absolute block h-[2.5px] w-[16px]", dark ? "bg-sw-cream" : "bg-sw-ink", look.portrait ? "left-[5px] top-[27px]" : "left-[18px] top-[13px]")} />
      <span className={cn("absolute bottom-[4px] right-[4px] block size-[8px] border border-dotted", dark ? "border-sw-cream" : "border-sw-ink")} />
    </span>
  );
}

export function PresetPicker({ value, onChange }: { value: CardPreset; onChange: (preset: CardPreset) => void }) {
  return (
    // Four across only when the picker itself is wide enough.
    <div className="@container">
      <div role="radiogroup" aria-label="Card design" className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        {CARD_PRESETS.map((preset) => {
          const active = preset === value;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              title={CARD_PRESET_INFO[preset].hint}
              onClick={() => onChange(preset)}
              className={cn(
                "flex min-h-11 flex-col items-center gap-1.5 rounded-2xl border bg-canvas p-2 text-center transition-colors duration-(--sw-dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                active ? "border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line",
              )}
            >
              <span className="grid h-[54px] place-items-center"><Thumb preset={preset} /></span>
              <span className="text-[14px] font-semibold leading-tight text-ink">{CARD_PRESET_INFO[preset].label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
