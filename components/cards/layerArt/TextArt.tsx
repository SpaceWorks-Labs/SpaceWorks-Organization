"use client";

import { useId, useSyncExternalStore, type CSSProperties } from "react";
import { PT_TO_MM } from "@/lib/cards/design/elements";
import { fillLayerText } from "@/lib/cards/design/layers";
import type { CardTextLayer } from "@/lib/cards/design/layerTypes";
import { curvePathD } from "@/lib/cards/design/textCurve";
import { applyCase } from "@/lib/cards/layerOps/textOps";
import { wrapText } from "@/lib/cards/text";
import type { CardHolder } from "@/lib/cards/types";
import { cardFontStack } from "../cardFonts";

/*
 * A text layer on the canvas with the browser's shaping, matching the printed outlines: the same case,
 * fit, arc and effects as lib/cards/layerOps/textOps.ts (highlight behind each line, an outline drawn
 * under the fill, hollow strokes, a hard shadow).
 */

let fontVersion = 0;
let context: CanvasRenderingContext2D | null = null;
function subscribe(onChange: () => void) {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return () => undefined;
  const bump = () => { fontVersion += 1; onChange(); };
  fonts.addEventListener("loadingdone", bump);
  return () => fonts.removeEventListener("loadingdone", bump);
}

/** The browser half of auto-fit: shrink by 10% steps until the wrapped lines fit the box, as the server does. */
function useFitPt(layer: CardTextLayer, text: string) {
  const version = useSyncExternalStore(subscribe, () => fontVersion, () => -1);
  if (!layer.autoFit || layer.curve !== 0 || version < 0) return layer.sizePt;
  context ??= document.createElement("canvas").getContext("2d");
  const ctx = context;
  if (!ctx) return layer.sizePt;
  const PX = 10;
  let sizePt = layer.sizePt;
  for (;;) {
    const sizePx = sizePt * PT_TO_MM * PX;
    ctx.font = `${layer.bold ? 700 : 400} ${sizePx}px ${cardFontStack(layer.font)}`;
    const measure = (value: string) => (ctx.measureText(value).width + [...value].length * layer.trackingEm * sizePx) / PX;
    const lines = wrapText(text, Math.max(1, layer.wMm), measure).length;
    if (lines * sizePt * PT_TO_MM * layer.lineHeight <= layer.hMm + 0.01 || sizePt <= 4) return sizePt;
    sizePt = Math.max(4, Math.round(sizePt * 9) / 10);
  }
}

export function TextArt({ layer, holder, pxPerMm, mono, alpha }: { layer: CardTextLayer; holder: CardHolder; pxPerMm: number; mono: boolean; alpha: number }) {
  const id = useId().replace(/:/g, "");
  const text = applyCase(fillLayerText(layer.text, holder), layer.textCase);
  const sizePt = useFitPt(layer, text);
  const px = (mm: number) => mm * pxPerMm;
  const size = px(sizePt * PT_TO_MM);
  const color = mono ? "#000000" : layer.color;
  const effectColor = mono ? (layer.effect === "highlight" ? "#FFFFFF" : "#000000") : layer.effectColor;
  const e = px(layer.effectMm);
  const font: CSSProperties = { fontFamily: cardFontStack(layer.font), fontSize: size, fontWeight: layer.bold ? 700 : 400, letterSpacing: `${layer.trackingEm}em` };

  if (layer.curve !== 0) {
    const d = curvePathD({ xMm: layer.xMm, yMm: layer.yMm, wMm: layer.wMm, hMm: layer.hMm, curve: layer.curve }, sizePt * PT_TO_MM * 0.8, sizePt * PT_TO_MM * 0.2, pxPerMm);
    return (
      <svg aria-hidden width={px(layer.wMm)} height={px(layer.hMm)} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path id={`a${id}`} d={d ?? ""} fill="none" />
        <text style={font} fill={color} fillOpacity={alpha} {...(layer.effect === "outline" ? { stroke: effectColor, strokeWidth: e * 2, paintOrder: "stroke", strokeLinejoin: "round" as const } : {})}>
          <textPath href={`#a${id}`} startOffset="50%" textAnchor="middle">{text.replace(/\s+/g, " ").trim()}</textPath>
        </text>
      </svg>
    );
  }

  const effect: CSSProperties =
    layer.effect === "outline" ? { WebkitTextStroke: `${e * 2}px ${effectColor}`, paintOrder: "stroke fill" }
    : layer.effect === "hollow" ? { WebkitTextStroke: `${e}px ${color}`, color: "transparent" }
    : layer.effect === "shadow" ? { textShadow: `${e}px ${e}px 0 ${effectColor}` }
    : {};
  const content = layer.effect === "highlight"
    ? <span style={{ background: effectColor, padding: `${e / 2}px ${e}px`, margin: `0 ${e}px`, borderRadius: e / 2, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{text}</span>
    : text;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, ...font, lineHeight: layer.lineHeight, textAlign: layer.align, textTransform: layer.textCase === "title" ? "capitalize" : undefined, color, opacity: alpha, overflowWrap: "anywhere", ...effect }}>
      {content}
    </div>
  );
}
