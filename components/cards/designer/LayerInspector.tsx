"use client";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { LAYER_PLACEHOLDERS, LAYER_TEXT_MAX, type CardLayer, type CardTextLayer } from "@/lib/cards/design/layers";
import { layerLabel } from "../CardLayerView";
import { ColourField } from "./ColourField";
import { NumberSlider, SwitchLine } from "./controls";
import { FontPicker } from "./FontPicker";

const PLACEHOLDER_LABELS: Record<(typeof LAYER_PLACEHOLDERS)[number], string> = { name: "Name", role: "Role", plan: "Plan", number: "Card number", validUntil: "Valid until" };

function TextSettings({ layer, onChange, orgAccent }: { layer: CardTextLayer; onChange: (patch: Partial<CardTextLayer>) => void; orgAccent: string }) {
  return (
    <>
      <Field label="Text" helperText="Placeholders fill in for each member.">
        <Textarea rows={3} maxLength={LAYER_TEXT_MAX} value={layer.text} onChange={(event) => onChange({ text: event.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
        {LAYER_PLACEHOLDERS.map((key) => (
          <button key={key} type="button" onClick={() => onChange({ text: `${layer.text}{${key}}`.slice(0, LAYER_TEXT_MAX) })} className="rounded-full border border-line bg-panel px-2.5 py-1 text-caption text-ink hover:bg-muted">
            {PLACEHOLDER_LABELS[key]}
          </button>
        ))}
      </div>
      <FontPicker value={layer.font} onChange={(font) => onChange({ font })} />
      <NumberSlider label="Text size" unit="pt" min={4} max={96} step={0.5} value={layer.sizePt} onChange={(sizePt) => onChange({ sizePt })} />
      <SegmentedControl<CardTextLayer["align"]> ariaLabel="Alignment" size="sm" value={layer.align} onValueChange={(align) => onChange({ align })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} className="self-start" />
      <SwitchLine label="Bold" checked={layer.bold} onCheckedChange={(bold) => onChange({ bold })} />
      <SwitchLine label="Capitals" checked={layer.uppercase} onCheckedChange={(uppercase) => onChange({ uppercase })} />
      <ColourField label="Text colour" value={layer.color} orgAccent={orgAccent} onChange={(color) => color && onChange({ color })} />
      <NumberSlider label="Letter spacing" unit="em" min={-0.1} max={0.5} step={0.01} value={layer.trackingEm} onChange={(trackingEm) => onChange({ trackingEm })} />
      <NumberSlider label="Line height" unit="×" min={0.8} max={2.5} step={0.05} value={layer.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} />
    </>
  );
}

/** Settings of the selected layer: what it shows, where it sits, how it is turned and faded. */
export function LayerInspector({ layer, card, orgAccent, uploading, onChange, onReplaceImage }: {
  layer: CardLayer;
  card: { widthMm: number; heightMm: number };
  orgAccent: string;
  uploading: boolean;
  onChange: (patch: Partial<CardLayer>) => void;
  onReplaceImage: (file: File) => void;
}) {
  const round = (value: number) => Math.round(value * 10) / 10;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-3.5">
      <p className="text-label font-semibold text-ink">{layerLabel(layer)}</p>
      {layer.locked ? <p className="text-caption text-ink-muted">Locked: unlock it in the layers list to move it on the card.</p> : null}
      <Field label="Layer name" optional><Input maxLength={40} value={layer.name} placeholder={layerLabel({ ...layer, name: "" })} onChange={(event) => onChange({ name: event.target.value })} /></Field>

      {layer.kind === "text" ? <TextSettings layer={layer} orgAccent={orgAccent} onChange={onChange} /> : null}
      {layer.kind === "image" ? (
        <>
          <SegmentedControl<"cover" | "contain"> ariaLabel="Fit" size="sm" value={layer.fit} onValueChange={(fit) => onChange({ fit })} options={[{ value: "cover", label: "Fill the box" }, { value: "contain", label: "Show it all" }]} className="self-start" />
          <NumberSlider label="Corner rounding" unit="mm" min={0} max={50} step={0.5} value={layer.radiusMm} onChange={(radiusMm) => onChange({ radiusMm })} />
          <SwitchLine label="Black and white" checked={layer.grayscale} onCheckedChange={(grayscale) => onChange({ grayscale })} />
          <Field label="Replace the image" helperText="PNG, JPEG or WebP, up to 5 MB.">
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onReplaceImage(file); event.target.value = ""; }} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
          </Field>
        </>
      ) : null}
      {layer.kind === "rect" || layer.kind === "ellipse" ? (
        <>
          <ColourField label="Fill" allowNone value={layer.fill} orgAccent={orgAccent} onChange={(fill) => onChange({ fill })} />
          <ColourField label="Outline" allowNone value={layer.stroke} orgAccent={orgAccent} onChange={(stroke) => onChange({ stroke })} />
          {layer.stroke ? <NumberSlider label="Outline width" unit="mm" min={0.1} max={5} step={0.1} value={layer.strokeMm} onChange={(strokeMm) => onChange({ strokeMm })} /> : null}
          {layer.kind === "rect" ? <NumberSlider label="Corner rounding" unit="mm" min={0} max={50} step={0.5} value={layer.radiusMm} onChange={(radiusMm) => onChange({ radiusMm })} /> : null}
        </>
      ) : null}
      {layer.kind === "line" ? (
        <>
          <ColourField label="Colour" value={layer.color} orgAccent={orgAccent} onChange={(color) => color && onChange({ color })} />
          <NumberSlider label="Thickness" unit="mm" min={0.1} max={5} step={0.1} value={layer.hMm} onChange={(hMm) => onChange({ hMm })} />
        </>
      ) : null}

      <NumberSlider label="Turn" unit="°" min={-180} max={180} step={1} value={layer.rotationDeg} onChange={(rotationDeg) => onChange({ rotationDeg })} />
      <NumberSlider label="Opacity" unit="%" min={0} max={100} step={1} value={layer.opacityPct} onChange={(opacityPct) => onChange({ opacityPct })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="From left (mm)"><Input type="number" step={0.5} value={layer.xMm} onChange={(event) => onChange({ xMm: round(Number(event.target.value)) })} /></Field>
        <Field label="From top (mm)"><Input type="number" step={0.5} value={layer.yMm} onChange={(event) => onChange({ yMm: round(Number(event.target.value)) })} /></Field>
        <Field label="Width (mm)"><Input type="number" step={0.5} min={1} value={layer.wMm} onChange={(event) => onChange({ wMm: round(Number(event.target.value)) })} /></Field>
        {layer.kind === "line" ? null : <Field label="Height (mm)"><Input type="number" step={0.5} min={1} value={layer.hMm} onChange={(event) => onChange({ hMm: round(Number(event.target.value)) })} /></Field>}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={() => onChange({ xMm: round((card.widthMm - layer.wMm) / 2) })}>Centre across</Button>
        <Button size="sm" variant="secondary" onClick={() => onChange({ yMm: round((card.heightMm - layer.hMm) / 2) })}>Centre down</Button>
        {layer.kind === "image" || layer.kind === "rect" ? <Button size="sm" variant="secondary" onClick={() => onChange({ xMm: 0, yMm: 0, wMm: card.widthMm, hMm: card.heightMm, rotationDeg: 0 })}>Fill the card</Button> : null}
      </div>
    </div>
  );
}
