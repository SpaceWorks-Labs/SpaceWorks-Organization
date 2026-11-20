"use client";

import type { CardLayer } from "@/lib/cards/design/layerTypes";
import type { CardHolder } from "@/lib/cards/types";
import { CardLayerView } from "../../CardLayerView";

export const THUMB = { w: 72, h: 48, pad: 6 } as const;

/**
 * A tile's picture, drawn by the card's own layer renderer so it matches what lands on the card.
 * `card`: the whole card in its background colour (bands, borders, corners); otherwise just the
 * element, scaled to fill the tile. Decorative: the tile's text names it.
 */
export function ElementThumb({ layers, card, holder, mono, frame }: { layers: CardLayer[]; card: { widthMm: number; heightMm: number; background: string }; holder: CardHolder; mono: boolean; frame: "card" | "element" }) {
  const box = frame === "card"
    ? { x: 0, y: 0, w: card.widthMm, h: card.heightMm }
    : (() => {
      const x = Math.min(...layers.map((layer) => layer.xMm));
      const y = Math.min(...layers.map((layer) => layer.yMm));
      return { x, y, w: Math.max(...layers.map((layer) => layer.xMm + layer.wMm)) - x, h: Math.max(...layers.map((layer) => layer.yMm + layer.hMm)) - y };
    })();
  const room = frame === "card" ? { w: THUMB.w, h: THUMB.h } : { w: THUMB.w - THUMB.pad * 2, h: THUMB.h - THUMB.pad * 2 };
  const pxPerMm = Math.min(room.w / Math.max(box.w, 1), room.h / Math.max(box.h, 1));
  return (
    <span aria-hidden className="relative grid place-items-center overflow-hidden rounded-md bg-subtle" style={{ width: THUMB.w, height: THUMB.h }}>
      <span className="relative block overflow-hidden" style={{ width: box.w * pxPerMm, height: box.h * pxPerMm, background: frame === "card" ? card.background : undefined, borderRadius: frame === "card" ? 3 * pxPerMm : undefined }}>
        <span className="absolute block" style={{ left: -box.x * pxPerMm, top: -box.y * pxPerMm, width: card.widthMm * pxPerMm, height: card.heightMm * pxPerMm }}>
          {layers.map((layer, index) => <CardLayerView key={layer.id} layer={layer} holder={holder} pxPerMm={pxPerMm} zIndex={index} mono={mono} />)}
        </span>
      </span>
    </span>
  );
}
