"use client";

import { useSyncExternalStore } from "react";
import { CARD_LINE_HEIGHT, nameBlockHeightMm, PT_TO_MM, type CardSideSettings } from "@/lib/cards/design/elements";
import { cardFontCssName, DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import { wrapText } from "@/lib/cards/text";

/*
 * The browser half of the name fit in lib/cards/layout.ts: once the card fonts have loaded, measure
 * the shaped name with canvas text metrics and shrink it until its wrapped lines fit the room kept for
 * it, exactly as the server does. Until then (and on the server) the estimate from nameSizePt stands.
 */

let fontVersion = 0;
const PX_PER_MM = 10;
let context: CanvasRenderingContext2D | null = null;

function subscribe(onChange: () => void) {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return () => undefined;
  const bump = () => {
    fontVersion += 1;
    onChange();
  };
  fonts.addEventListener("loadingdone", bump);
  return () => fonts.removeEventListener("loadingdone", bump);
}

export function useNameSizePt(settings: CardSideSettings, name: string, estimatePt: number, weight: number, trackingEm: number, uppercase: boolean) {
  const version = useSyncExternalStore(subscribe, () => fontVersion, () => -1);
  if (version < 0 || !settings.nameAutoFit || !name.trim()) return estimatePt;
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return estimatePt;
  const ctx = context;
  const text = uppercase ? name.toLocaleUpperCase("en") : name;
  const segments = (value: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)].length;
  const room = nameBlockHeightMm(settings.elementTextSizes.name) + 0.01;
  const floor = settings.elementTextSizes.name * 0.3;
  let sizePt = estimatePt;
  for (;;) {
    const sizePx = sizePt * PT_TO_MM * PX_PER_MM;
    ctx.font = `${weight} ${sizePx}px "${cardFontCssName(settings.elementFonts.name ?? DEFAULT_CARD_FONT)}", "SWO Noto"`;
    const measure = (value: string) => ctx.measureText(value).width / PX_PER_MM + trackingEm * sizePt * PT_TO_MM * segments(value);
    const lines = wrapText(text, settings.elementSizes.name, measure).length;
    if (lines * sizePt * PT_TO_MM * CARD_LINE_HEIGHT.name <= room || sizePt <= floor) return sizePt;
    sizePt = Math.max(floor, Math.round(sizePt * 9) / 10);
  }
}
