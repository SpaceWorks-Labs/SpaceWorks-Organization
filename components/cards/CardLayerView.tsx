"use client";

import type { CSSProperties, PointerEvent } from "react";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import type { CardHolder } from "@/lib/cards/types";
import { LayerArt } from "./layerArt/LayerArt";
import type { CanvasInteraction } from "./canvasInteraction";

/*
 * One of a side's own layers on the canvas, drawn as the server renderer draws it (lib/cards/
 * layerLayout.ts): the box turned about its centre and faded as a whole. In the designer a press
 * selects it and starts moving the selection; the selection frame, handles and keyboard moves live
 * in the designer (components/cards/designer/editor/).
 */

const KIND_LABELS: Record<Exclude<CardLayer["kind"], "text">, string> = {
  image: "Image",
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  shape: "Shape",
  icon: "Icon",
  qr: "QR code",
  barcode: "Barcode",
  photo: "Member photo",
};

export function layerLabel(layer: CardLayer) {
  if (layer.name) return layer.name;
  if (layer.kind === "text") return layer.text.replace(/\s+/g, " ").trim().slice(0, 30) || "Empty text";
  // A picture's description names it for screen readers on the canvas and in the layers list.
  if (layer.kind === "image" && layer.alt.trim()) return `${KIND_LABELS.image}: ${layer.alt.trim().slice(0, 60)}`;
  return KIND_LABELS[layer.kind];
}

export function layerFrameStyle(layer: Pick<CardLayer, "xMm" | "yMm" | "wMm" | "hMm" | "rotationDeg">, pxPerMm: number): CSSProperties {
  const px = (mm: number) => `${mm * pxPerMm}px`;
  return { position: "absolute", left: px(layer.xMm), top: px(layer.yMm), width: px(layer.wMm), height: px(layer.hMm), transform: layer.rotationDeg ? `rotate(${layer.rotationDeg}deg)` : undefined, transformOrigin: "center" };
}

export function CardLayerView({ layer, holder, pxPerMm, zIndex, mono, interaction }: { layer: CardLayer; holder: CardHolder; pxPerMm: number; zIndex: number; mono: boolean; interaction?: CanvasInteraction }) {
  if (layer.hidden) return null;
  const selected = interaction?.selection.includes(layer.id) ?? false;
  const itemProps = interaction
    ? {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `${layerLabel(layer)}${layer.locked ? " (locked)" : ""}. Arrow keys move the selection; hold Shift for bigger steps.`,
      "aria-pressed": selected,
      onPointerDown: (event: PointerEvent<HTMLElement>) => interaction.onLayerPointerDown(layer.id, event),
      onFocus: () => { if (!selected) interaction.onSelect(layer.id); },
      className: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    }
    : {};
  return (
    <div {...itemProps} style={{ ...layerFrameStyle(layer, pxPerMm), zIndex, cursor: interaction ? (layer.locked ? "pointer" : "move") : undefined, touchAction: interaction ? "none" : undefined, userSelect: interaction ? "none" : undefined }}>
      <LayerArt layer={layer} holder={holder} pxPerMm={pxPerMm} mono={mono} />
    </div>
  );
}
