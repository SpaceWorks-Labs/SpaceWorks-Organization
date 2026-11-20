"use client";

import { BRAND } from "@/lib/cards/palette";
import { PATTERN_KINDS, type CardPattern, type CardPatternKind, type CardShadow } from "@/lib/cards/design/layerTypes";
import { ColourField } from "../ColourField";
import { SwitchLine } from "../controls";
import { Choice, Slider, type ColourContext } from "./fields";
import { C } from "./inspectorControls";

const PATTERN_LABELS: Record<CardPatternKind | "none", string> = { none: "None", dots: "Dots", stripes: "Stripes", grid: "Grid", waves: "Waves" };

/** A texture over the fill: none, dots, stripes, grid or waves, with its colour, repeat and angle. */
export function PatternField({ value, colours, onChange }: { value: CardPattern | null; colours: ColourContext; onChange: (next: CardPattern | null) => void }) {
  const kind = value?.kind ?? "none";
  return (
    <>
      <Choice<CardPatternKind | "none">
        label={C.pattern.label}
        value={kind}
        options={(["none", ...PATTERN_KINDS] as const).map((key) => ({ value: key, label: PATTERN_LABELS[key] }))}
        onChange={(next) => onChange(next === "none" ? null : { kind: next, color: value?.color ?? BRAND.white, scaleMm: value?.scaleMm ?? 3, angleDeg: value?.angleDeg ?? 0 })}
      />
      {value ? (
        <>
          <ColourField label={C.patternColour.label} value={value.color} {...colours} onChange={(color) => color && onChange({ ...value, color })} />
          <Slider label={C.patternScale.label} unit="mm" min={1} max={20} step={0.5} value={value.scaleMm} onChange={(scaleMm) => onChange({ ...value, scaleMm })} />
          <Slider label={C.patternAngle.label} unit="°" min={-90} max={90} step={5} value={value.angleDeg} onChange={(angleDeg) => onChange({ ...value, angleDeg })} />
        </>
      ) : null}
    </>
  );
}

const NEW_SHADOW: CardShadow = { color: BRAND.ink, dxMm: 0.6, dyMm: 0.6, opacityPct: 35 };

/** A hard drop shadow: on or off, colour, offset across and down, strength. */
export function ShadowField({ value, colours, onChange }: { value: CardShadow | null; colours: ColourContext; onChange: (next: CardShadow | null) => void }) {
  return (
    <>
      <SwitchLine label={C.shadow.label} checked={Boolean(value)} onCheckedChange={(on) => onChange(on ? { ...NEW_SHADOW } : null)} />
      {value ? (
        <>
          <ColourField label={C.shadowColour.label} value={value.color} {...colours} onChange={(color) => color && onChange({ ...value, color })} />
          <Slider label={C.shadowX.label} unit="mm" min={-5} max={5} step={0.1} value={value.dxMm} onChange={(dxMm) => onChange({ ...value, dxMm })} />
          <Slider label={C.shadowY.label} unit="mm" min={-5} max={5} step={0.1} value={value.dyMm} onChange={(dyMm) => onChange({ ...value, dyMm })} />
          <Slider label={C.shadowOpacity.label} unit="%" min={0} max={100} step={1} value={value.opacityPct} onChange={(opacityPct) => onChange({ ...value, opacityPct })} />
        </>
      ) : null}
    </>
  );
}
