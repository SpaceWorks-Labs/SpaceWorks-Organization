"use client";

import { Field, Input } from "@/components/ui/field";
import type { PlaceholderOption } from "@/lib/cards/design/library/placeholders";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { layerLabel } from "../CardLayerView";
import { reword, useDesignerNoun } from "./wording";
import { DesignColours } from "./inspector/DesignColours";
import { Group, Slider, type ColourContext } from "./inspector/fields";
import { ImageInspector } from "./inspector/ImageInspector";
import { C } from "./inspector/inspectorControls";
import { BarcodeInspector, IconInspector, LineInspector, PhotoInspector, QrInspector } from "./inspector/MarkInspector";
import { PaintInspector } from "./inspector/PaintInspector";
import { TextInspector } from "./inspector/TextInspector";

/**
 * Settings of the selected layer, by kind: what it shows and how it looks, then how faded it is.
 * Where it sits, its size and turn are in the Position panel; aligning, flipping and stacking in
 * Arrange. With `onReplaceColour`, the colours used in the design are listed to replace everywhere.
 */
export function LayerInspector({ layer, orgAccent, uploading, unitLevels, brandColours, brandFonts, documentColours, placeholders, onChange, onReplaceImage, onReplaceColour }: {
  layer: CardLayer;
  /** The card's size; kept for callers, the Position panel uses it now. */
  card?: { widthMm: number; heightMm: number };
  orgAccent: string;
  uploading: boolean;
  /** The organisation's level names, top first; left out, unit placeholders use generic names. */
  unitLevels?: readonly string[];
  /** The brand kit's colours and card font ids, offered first. */
  brandColours?: readonly string[];
  brandFonts?: readonly string[];
  /** Every colour the design uses (`documentColours(design)`). */
  documentColours?: readonly string[];
  /** Placeholder chips for text layers; the card's member fields when left out. */
  placeholders?: readonly PlaceholderOption[];
  onChange: (patch: Partial<CardLayer>) => void;
  onReplaceImage: (file: File) => void;
  /** Replace one colour with another across the whole design, both sides. */
  onReplaceColour?: (from: string, to: string) => void;
}) {
  const noun = useDesignerNoun();
  const colours: ColourContext = { orgAccent, brandColours, documentColours };
  const set = <T extends CardLayer>(patch: Partial<T>) => onChange(patch as Partial<CardLayer>);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
      <p className="text-label font-semibold text-ink">{layerLabel(layer)}</p>
      {layer.locked ? <p className="text-caption text-ink-muted">Locked: {reword("unlock it in the layers list to change it on the card.", noun)}</p> : null}
      <Field label={C.name.label} optional><Input maxLength={40} value={layer.name} placeholder={layerLabel({ ...layer, name: "" })} onChange={(event) => onChange({ name: event.target.value })} /></Field>

      {layer.kind === "text" ? <TextInspector layer={layer} colours={colours} unitLevels={unitLevels} brandFonts={brandFonts} placeholders={placeholders} onChange={set} /> : null}
      {layer.kind === "image" ? <ImageInspector layer={layer} colours={colours} uploading={uploading} onReplaceImage={onReplaceImage} onChange={set} /> : null}
      {layer.kind === "rect" || layer.kind === "ellipse" || layer.kind === "shape" ? <PaintInspector layer={layer} colours={colours} onChange={set} /> : null}
      {layer.kind === "line" ? <LineInspector layer={layer} colours={colours} onChange={set} /> : null}
      {layer.kind === "icon" ? <IconInspector layer={layer} colours={colours} onChange={set} /> : null}
      {layer.kind === "qr" ? <QrInspector layer={layer} colours={colours} onChange={set} /> : null}
      {layer.kind === "barcode" ? <BarcodeInspector layer={layer} colours={colours} onChange={set} /> : null}
      {layer.kind === "photo" ? <PhotoInspector layer={layer} colours={colours} onChange={set} /> : null}

      <Slider label={C.opacity.label} unit="%" min={0} max={100} step={1} value={layer.opacityPct} onChange={(opacityPct) => onChange({ opacityPct })} />
      {onReplaceColour && documentColours?.length ? (
        <Group title="Colours in this design">
          <DesignColours colours={documentColours} onReplace={onReplaceColour} />
        </Group>
      ) : null}
    </div>
  );
}
