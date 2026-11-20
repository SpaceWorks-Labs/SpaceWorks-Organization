"use client";

import type { ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Ban, Pipette } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { RadioGroup } from "@/components/ui/choice";
import { cn } from "@/lib/cn";
import { shapeMarkup } from "@/lib/logo/logoSvg";
import { LOGO_SHAPE_LABELS, LOGO_SHAPES, type LogoShape } from "@/lib/logo/spec";
import { LOGO_ICONS } from "@/lib/logo/icons";

const tile =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-line bg-panel text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-subtle data-[state=checked]:border-[1.5px] data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft";

/** Brand colours offered for every logo, before the organisation's own brand kit colours. */
export const LOGO_PRESET_COLOURS = ["#142C2A", "#006E63", "#FF7447", "#DFFF8F", "#B5CDFF", "#FFD447", "#FFF4E8", "#FFFFFF", "#5B3FD9", "#B3261E"] as const;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-ink">{label}</span>
      {children}
    </div>
  );
}

export function ShapeChoice({ value, onChange }: { value: LogoShape; onChange: (shape: LogoShape) => void }) {
  return (
    <Group label="Shape">
      <RadioGroup aria-label="Shape" value={value} onValueChange={(next) => onChange(next as LogoShape)} className="flex flex-row flex-wrap gap-2">
        {LOGO_SHAPES.map((shape) => (
          <RadioGroupPrimitive.Item key={shape} value={shape} aria-label={LOGO_SHAPE_LABELS[shape]} title={LOGO_SHAPE_LABELS[shape]} className={tile}>
            <svg aria-hidden viewBox="0 0 512 512" className="size-6 text-ink" dangerouslySetInnerHTML={{ __html: shapeMarkup(shape, "currentColor") }} />
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroup>
    </Group>
  );
}

/** Preset and brand kit swatches as one radio group, plus a picker for any other colour. */
export function ColourChoice({ label, value, colours, onChange }: { label: string; value: string; colours: readonly string[]; onChange: (hex: string) => void }) {
  const options = [...new Set(colours.map((colour) => colour.toUpperCase()))];
  const custom = !options.includes(value);
  return (
    <Group label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <RadioGroup aria-label={label} value={custom ? "" : value} onValueChange={onChange} className="flex flex-row flex-wrap gap-2">
          {options.map((colour) => (
            <RadioGroupPrimitive.Item key={colour} value={colour} aria-label={colour} title={colour} className={cn(tile, "p-1")}>
              <span aria-hidden className="size-full rounded-full border border-line-strong" style={{ background: colour }} />
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroup>
        <ColorPicker
          plain
          value={value}
          defaultColor={value}
          label={`${label}: your own colour`}
          onChange={(hex) => onChange(hex.toUpperCase())}
          trigger={
            <button type="button" aria-label={`${label}: your own colour${custom ? `, ${value}` : ""}`} className={cn(tile, custom && "border-[1.5px] border-accent bg-accent-soft")}>
              {custom ? <span aria-hidden className="size-7 rounded-full border border-line-strong" style={{ background: value }} /> : <Pipette aria-hidden className="size-[18px]" />}
            </button>
          }
        />
      </div>
    </Group>
  );
}

export function IconChoice({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  return (
    <Group label="Icon (optional)">
      <RadioGroup aria-label="Icon" value={value ?? "none"} onValueChange={(next) => onChange(next === "none" ? null : next)} className="grid grid-cols-[repeat(auto-fill,44px)] gap-2">
        <RadioGroupPrimitive.Item value="none" aria-label="No icon" title="No icon" className={tile}>
          <Ban aria-hidden className="size-[18px] text-ink-muted" />
        </RadioGroupPrimitive.Item>
        {LOGO_ICONS.map((icon) => (
          <RadioGroupPrimitive.Item key={icon.id} value={icon.id} aria-label={icon.label} title={icon.label} className={tile}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={icon.d} />
            </svg>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroup>
    </Group>
  );
}
