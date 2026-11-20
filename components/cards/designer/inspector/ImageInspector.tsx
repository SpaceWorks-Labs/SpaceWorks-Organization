"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IMAGE_MASKS, NO_ADJUST, NO_CROP, type CardImageAdjust, type CardImageLayer, type CardImageMask } from "@/lib/cards/design/layerTypes";
import { SwitchLine } from "../controls";
import { ShadowField } from "./EffectFields";
import { Choice, Group, Slider, type ColourContext } from "./fields";
import { C } from "./inspectorControls";

const MASK_LABELS: Record<CardImageMask, string> = { none: "None", circle: "Circle", hexagon: "Hexagon" };
export const ALT_MAX = 200;

/** Fit, crop, mask, rounding, colour adjustments, shadow, replacing and describing an uploaded picture. */
export function ImageInspector({ layer, onChange, colours, uploading, onReplaceImage }: {
  layer: CardImageLayer;
  onChange: (patch: Partial<CardImageLayer>) => void;
  colours: ColourContext;
  uploading: boolean;
  onReplaceImage: (file: File) => void;
}) {
  const adjust = (patch: Partial<CardImageAdjust>) => onChange({ adjust: { ...layer.adjust, ...patch } });
  const crop = (patch: Partial<CardImageLayer["crop"]>) => onChange({ crop: { ...layer.crop, ...patch } });
  const adjusted = (Object.keys(NO_ADJUST) as Array<keyof CardImageAdjust>).some((key) => layer.adjust[key] !== NO_ADJUST[key]);
  return (
    <>
      <Field label={C.alt.label} helperText="Say what the picture shows, or leave it empty if it's decoration.">
        <Input maxLength={ALT_MAX} value={layer.alt} onChange={(event) => onChange({ alt: event.target.value.slice(0, ALT_MAX) })} />
      </Field>
      <Choice<CardImageLayer["fit"]> label={C.fit.label} value={layer.fit} options={[{ value: "cover", label: "Fill the box" }, { value: "contain", label: "Show it all" }]} onChange={(fit) => onChange({ fit, ...(fit === "contain" ? { crop: { ...NO_CROP } } : {}) })} />
      {layer.fit === "cover" ? (
        <Group title="Crop">
          <Slider label={C.zoom.label} unit="×" min={1} max={5} step={0.1} value={layer.crop.zoom} onChange={(zoom) => crop({ zoom })} />
          <Slider label={C.focusX.label} unit="%" min={0} max={100} step={1} value={layer.crop.xPct} onChange={(xPct) => crop({ xPct })} />
          <Slider label={C.focusY.label} unit="%" min={0} max={100} step={1} value={layer.crop.yPct} onChange={(yPct) => crop({ yPct })} />
        </Group>
      ) : null}
      <Choice label={C.mask.label} value={layer.mask} options={IMAGE_MASKS.map((mask) => ({ value: mask, label: MASK_LABELS[mask] }))} onChange={(mask) => onChange({ mask })} />
      {layer.mask === "none" && layer.fit === "cover" ? <Slider label={C.radius.label} unit="mm" min={0} max={50} step={0.5} value={layer.radiusMm} onChange={(radiusMm) => onChange({ radiusMm })} /> : null}
      <Group title="Adjustments">
        <SwitchLine label={C.grayscale.label} checked={layer.grayscale} onCheckedChange={(grayscale) => onChange({ grayscale })} />
        <Slider label={C.brightness.label} unit="" min={-100} max={100} step={1} value={layer.adjust.brightness} onChange={(brightness) => adjust({ brightness })} />
        <Slider label={C.contrast.label} unit="" min={-100} max={100} step={1} value={layer.adjust.contrast} onChange={(contrast) => adjust({ contrast })} />
        <Slider label={C.saturation.label} unit="" min={-100} max={100} step={1} value={layer.adjust.saturation} onChange={(saturation) => adjust({ saturation })} />
        <Slider label={C.blur.label} unit="px" min={0} max={20} step={1} value={layer.adjust.blur} onChange={(blur) => adjust({ blur })} />
        {adjusted ? <Button size="md" variant="secondary" className="self-start" onClick={() => onChange({ adjust: { ...NO_ADJUST } })}>{C.resetAdjust.label}</Button> : null}
        <ShadowField value={layer.shadow} colours={colours} onChange={(shadow) => onChange({ shadow })} />
      </Group>
      <Field label={C.replace.label} helperText="Keeps its size and place. PNG, JPEG or WebP, up to 5 MB.">
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onReplaceImage(file); event.target.value = ""; }} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
      </Field>
    </>
  );
}
