"use client";

import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { placeholderOptions, type PlaceholderOption } from "@/lib/cards/design/library/placeholders";
import { LAYER_TEXT_MAX, type CardTextCase, type CardTextEffect, type CardTextLayer } from "@/lib/cards/design/layerTypes";
import { ColourField } from "../ColourField";
import { SwitchLine } from "../controls";
import { FontPicker } from "../FontPicker";
import { Choice, Group, Slider, type ColourContext } from "./fields";
import { C, TARGET } from "./inspectorControls";

const CASES: Array<{ value: CardTextCase; label: string }> = [
  { value: "none", label: "As typed" },
  { value: "upper", label: "Capitals" },
  { value: "lower", label: "Lower case" },
  { value: "title", label: "Title case" },
];
const EFFECTS: Array<{ value: CardTextEffect; label: string }> = [
  { value: "none", label: "None" },
  { value: "highlight", label: "Highlight" },
  { value: "outline", label: "Outline" },
  { value: "hollow", label: "Hollow" },
  { value: "shadow", label: "Shadow" },
];

/** What a text layer says and how it is set: font, size, case, colour, spacing, curve and effect. */
export function TextInspector({ layer, onChange, colours, unitLevels, brandFonts, placeholders }: {
  layer: CardTextLayer;
  onChange: (patch: Partial<CardTextLayer>) => void;
  colours: ColourContext;
  unitLevels?: readonly string[];
  brandFonts?: readonly string[];
  /** The placeholder chips to offer; the card's member fields when left out. */
  placeholders?: readonly PlaceholderOption[];
}) {
  // Designs saved before `textCase` carry `uppercase`; it stays in step with the case (older releases read it).
  const textCase = layer.uppercase && layer.textCase === "none" ? "upper" : layer.textCase;
  return (
    <>
      <Field label={C.text.label} helperText="Placeholders fill in for each member.">
        <Textarea rows={3} maxLength={LAYER_TEXT_MAX} value={layer.text} onChange={(event) => onChange({ text: event.target.value })} />
      </Field>
      <div role="group" aria-label={C.placeholder.label} className="flex flex-wrap gap-1">
        {(placeholders ?? placeholderOptions(unitLevels)).map(({ key, label }) => (
          <button key={key} type="button" aria-label={`Insert ${label.toLowerCase()}`} onClick={() => onChange({ text: `${layer.text}{${key}}`.slice(0, LAYER_TEXT_MAX) })} className={cn(TARGET.button, "rounded-full border border-line bg-panel px-3 text-caption text-ink hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>
      <FontPicker value={layer.font} brandFonts={brandFonts} onChange={(font) => onChange({ font })} />
      <Slider label={C.size.label} unit="pt" min={4} max={96} step={0.5} value={layer.sizePt} onChange={(sizePt) => onChange({ sizePt })} />
      <SwitchLine label={C.bold.label} checked={layer.bold} onCheckedChange={(bold) => onChange({ bold })} />
      <Choice label={C.textCase.label} value={textCase} options={CASES} onChange={(next) => onChange({ textCase: next, uppercase: next === "upper" })} />
      <Choice<CardTextLayer["align"]> label={C.align.label} value={layer.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} onChange={(align) => onChange({ align })} />
      <ColourField label={C.textColour.label} value={layer.color} {...colours} onChange={(color) => color && onChange({ color })} />
      <Slider label={C.tracking.label} unit="em" min={-0.1} max={0.5} step={0.01} value={layer.trackingEm} onChange={(trackingEm) => onChange({ trackingEm })} />
      <Slider label={C.lineHeight.label} unit="×" min={0.8} max={2.5} step={0.05} value={layer.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} />
      <SwitchLine label={C.autoFit.label} hint="Long text gets smaller instead of overflowing." checked={layer.autoFit} onCheckedChange={(autoFit) => onChange({ autoFit })} />
      <Group title="Curve and effect">
        <Slider label={C.curve.label} unit="" min={-100} max={100} step={1} value={layer.curve} onChange={(curve) => onChange({ curve })} />
        <p className="text-caption text-ink-muted">Bends the first line along an arc; 0 is straight, below 0 bends it the other way.</p>
        <Choice label={C.effect.label} value={layer.effect} options={EFFECTS} onChange={(effect) => onChange({ effect })} />
        {layer.effect !== "none" ? (
          <>
            <ColourField label={C.effectColour.label} value={layer.effectColor} {...colours} onChange={(effectColor) => effectColor && onChange({ effectColor })} />
            {layer.effect !== "highlight" ? <Slider label={C.effectWidth.label} unit="mm" min={0.1} max={3} step={0.1} value={layer.effectMm} onChange={(effectMm) => onChange({ effectMm })} /> : null}
          </>
        ) : null}
      </Group>
    </>
  );
}
