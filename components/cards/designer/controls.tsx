"use client";

import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/choice";
import { Chip, type ChipTone } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { CARD_COLOUR_LABELS } from "@/lib/cards/palette";

/** Small building blocks of the card designer's side panels. */

export type SaveStatus = "saved" | "pending" | "saving" | "error";

const STATUS: Record<SaveStatus, { tone: ChipTone; label: string }> = {
  saved: { tone: "success", label: "Saved" },
  pending: { tone: "neutral", label: "Unsaved changes" },
  saving: { tone: "neutral", label: "Saving…" },
  error: { tone: "danger", label: "Not saved" },
};

export function SaveStatusPill({ status }: { status: SaveStatus }) {
  return <Chip size="sm" tone={STATUS[status].tone}>{STATUS[status].label}</Chip>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function SwitchLine({ label, hint, checked, disabled, onCheckedChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className={cn("min-w-0 cursor-pointer", disabled && "cursor-not-allowed")}>
        <span className={cn("block text-body-ui", disabled ? "text-ink-muted" : "text-ink")}>{label}</span>
        {hint ? <span className="block text-caption text-ink-muted">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ToggleField({ label, checked, onCheckedChange, children }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${id}-input`} className="text-label text-ink">{label}</label>
        <Switch aria-label={`Show ${label.toLowerCase()}`} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <div id={`${id}-input`} className="contents">{children}</div>
    </div>
  );
}

/** A labelled colour choice: a swatch plus its name, so the choice never depends on colour alone. */
export function SwatchGroup<T extends string>({ label, value, options, colourOf, onChange }: { label: string; value: T; options: readonly T[]; colourOf: (key: T) => string | null; onChange: (key: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label text-ink">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((key) => {
          const colour = colourOf(key);
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-[14px] text-ink transition-colors duration-(--sw-dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]",
                active ? "border-primary bg-subtle font-semibold shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line",
              )}
            >
              {colour ? <span aria-hidden className="size-4 shrink-0 rounded-full border border-line-strong" style={{ background: colour }} /> : null}
              {CARD_COLOUR_LABELS[key as keyof typeof CARD_COLOUR_LABELS]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NumberSlider({ label, unit, min, max, step, value, onChange }: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-caption text-ink-muted">{label}</label>
        <span className="flex items-center gap-1">
          <Input aria-label={`${label} (${unit})`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-[84px] px-3 text-right tabular-nums" />
          <span className="text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--color-primary)]" />
    </div>
  );
}
