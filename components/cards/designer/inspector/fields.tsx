"use client";

import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { TARGET } from "./inspectorControls";

/*
 * The inspector's own controls, each a 44px target operable from the keyboard: a slider with a number
 * box beside it (arrow keys, Page Up/Down, Home/End, or type), and a row of choices (Tab to one,
 * Enter or Space to choose).
 */

/** What every colour field in the inspector offers besides the quick swatches. */
export type ColourContext = { orgAccent: string; brandColours?: readonly string[]; documentColours?: readonly string[] };

export function Slider({ label, unit, min, max, step, value, onChange }: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const set = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    onChange(Math.min(max, Math.max(min, Math.round(Math.round(raw / step) * step * 1000) / 1000)));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-caption text-ink-muted">{label}</label>
        <span className="flex items-center gap-1">
          <Input aria-label={`${label} (${unit})`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => set(Number(event.target.value))} className={cn(TARGET.slider, "w-[84px] px-3 text-right tabular-nums")} />
          <span className="w-6 text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => set(Number(event.target.value))} className={cn(TARGET.slider, "w-full accent-[var(--color-primary)]")} />
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-ink-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              TARGET.choice,
              "rounded-control border px-3 text-[14px] text-ink transition-colors duration-(--sw-dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] motion-reduce:transition-none",
              option.value === value ? "border-primary bg-subtle font-semibold shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line bg-panel",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A small titled group inside the inspector. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 border-t border-line pt-3">
      <h4 id={id} className="text-caption font-semibold text-ink">{title}</h4>
      {children}
    </section>
  );
}
