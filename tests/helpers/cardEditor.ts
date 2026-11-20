import { LAYER_DEFAULTS, PAINT_DEFAULTS, TEXT_DEFAULTS, type CardLayer } from "@/lib/cards/design/layerTypes";

/** Small layer builders for the card editor tests. */

export const CARD = { widthMm: 85.6, heightMm: 54 };

export function rect(id: string, xMm: number, yMm: number, wMm: number, hMm: number, extra: Partial<CardLayer> = {}): CardLayer {
  return { ...LAYER_DEFAULTS, ...PAINT_DEFAULTS, id, kind: "rect", xMm, yMm, wMm, hMm, radiusMm: 0, ...extra } as CardLayer;
}

export function text(id: string, xMm: number, yMm: number, wMm: number, hMm: number, extra: Partial<CardLayer> = {}): CardLayer {
  return { ...LAYER_DEFAULTS, ...TEXT_DEFAULTS, id, kind: "text", xMm, yMm, wMm, hMm, text: "Hello", font: "gilroy", sizePt: 12, color: "#142C2A", ...extra } as CardLayer;
}

export function side(layers: CardLayer[]) {
  return { ...CARD, layers, order: ["header", "name", ...layers.map((layer) => layer.id)] };
}
