"use client";

import { useId, type ReactNode } from "react";
import QRCode from "react-qr-code";
import { barcodeText, code128 } from "@/lib/cards/design/barcode";
import { cardIcon, ICON_VIEWBOX } from "@/lib/cards/design/icons";
import type { CardLayer, CardShadow, ShapePaint } from "@/lib/cards/design/layerTypes";
import { fullStops, gradientGeometry, patternCmds } from "@/lib/cards/design/paint";
import { pathD, transformPath, type PathCmd } from "@/lib/cards/design/path";
import { layerOutline } from "@/lib/cards/design/shapes";
import type { CardHolder } from "@/lib/cards/types";

/*
 * Vector layers on the canvas as one SVG in the layer's own millimetres, from the same outlines,
 * gradients and textures the PDF and PNG draw (lib/cards/layerOps/*). Opacity fades each part, as in
 * print. Overflow shows, so outlines and shadows past the box edge appear as they print.
 */

type Colour = (hex: string) => string;
const svgStyle = { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" } as const;

export function Svg({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={svgStyle}>{children}</svg>;
}

export function ShadowPath({ outline, shadow, colour, alpha }: { outline: PathCmd[]; shadow: CardShadow; colour: Colour; alpha: number }) {
  return <path d={pathD(transformPath(outline, shadow.dxMm, shadow.dyMm, 1, 1))} fill={colour(shadow.color)} fillOpacity={alpha * (shadow.opacityPct / 100)} fillRule="evenodd" />;
}

function Paint({ paint, outline, w, h, colour, alpha }: { paint: ShapePaint; outline: PathCmd[]; w: number; h: number; colour: Colour; alpha: number }) {
  const id = useId().replace(/:/g, "");
  const d = pathD(outline);
  const geometry = paint.gradient ? gradientGeometry(paint.gradient, w, h) : null;
  const stops = geometry ? fullStops(geometry.stops).map((stop) => <stop key={stop.atPct} offset={stop.atPct / 100} stopColor={colour(stop.color)} />) : null;
  return (
    <>
      {paint.shadow ? <ShadowPath outline={outline} shadow={paint.shadow} colour={colour} alpha={alpha} /> : null}
      {geometry ? (
        <defs>
          {geometry.type === "linear"
            ? <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2}>{stops}</linearGradient>
            : <radialGradient id={`g${id}`} gradientUnits="userSpaceOnUse" cx={geometry.cx} cy={geometry.cy} r={geometry.r}>{stops}</radialGradient>}
        </defs>
      ) : null}
      {geometry || paint.fill ? <path d={d} fill={geometry ? `url(#g${id})` : colour(paint.fill!)} fillRule="evenodd" fillOpacity={alpha} /> : null}
      {paint.pattern ? (
        <>
          <clipPath id={`c${id}`}><path d={d} clipRule="evenodd" /></clipPath>
          <path clipPath={`url(#c${id})`} d={pathD(patternCmds(paint.pattern, w, h).cmds)} fill={colour(paint.pattern.color)} fillOpacity={alpha} />
        </>
      ) : null}
      {paint.stroke && paint.strokeMm > 0 ? <path d={d} fill="none" stroke={colour(paint.stroke)} strokeWidth={paint.strokeMm} strokeLinejoin="round" strokeOpacity={alpha} /> : null}
    </>
  );
}

/** Shapes, lines, icons and barcodes; null for kinds drawn elsewhere. */
export function VectorArt({ layer, holder, colour, alpha }: { layer: CardLayer; holder: CardHolder; colour: Colour; alpha: number }) {
  const { wMm: w, hMm: h } = layer;
  if (layer.kind === "rect" || layer.kind === "ellipse" || layer.kind === "shape") {
    return <Svg w={w} h={h}><Paint paint={layer} outline={layerOutline(layer) ?? []} w={w} h={h} colour={colour} alpha={alpha} /></Svg>;
  }
  if (layer.kind === "line") {
    if (layer.dash === "solid") return <Svg w={w} h={h}><rect width={w} height={h} fill={colour(layer.color)} fillOpacity={alpha} /></Svg>;
    const inset = layer.dash === "dotted" ? h / 2 : 0;
    const dash = layer.dash === "dashed" ? `${h * 3} ${h * 2}` : `0.01 ${h * 2}`;
    return <Svg w={w} h={h}><path d={`M${inset} ${h / 2}L${w - inset} ${h / 2}`} stroke={colour(layer.color)} strokeWidth={h} strokeDasharray={dash} strokeLinecap={layer.dash === "dotted" ? "round" : "butt"} strokeOpacity={alpha} /></Svg>;
  }
  if (layer.kind === "icon") {
    const icon = cardIcon(layer.icon);
    if (!icon) return null;
    const side = Math.min(w, h);
    const scale = side / ICON_VIEWBOX;
    return (
      <Svg w={w} h={h}>
        <path transform={`translate(${(w - side) / 2} ${(h - side) / 2}) scale(${scale})`} d={icon.d} fill="none" stroke={colour(layer.color)} strokeWidth={layer.strokeMm / scale} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={alpha} />
      </Svg>
    );
  }
  if (layer.kind === "barcode") {
    const value = barcodeText(holder.idNumber);
    const { bars, modules } = code128(value);
    const band = layer.showText ? h * 0.26 : 0;
    const unit = modules ? w / modules : 0;
    return (
      <Svg w={w} h={h}>
        {layer.background ? <rect width={w} height={h} fill={colour(layer.background)} fillOpacity={alpha} /> : null}
        {bars.map(([at, width]) => <rect key={at} x={at * unit} width={width * unit} height={h - band} fill={colour(layer.color)} fillOpacity={alpha} />)}
        {layer.showText && value ? <text x={w / 2} y={h - band * 0.18} textAnchor="middle" fontSize={band * 0.78} letterSpacing={band * 0.78 * 0.04} fill={colour(layer.color)} fillOpacity={alpha} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</text> : null}
      </Svg>
    );
  }
  if (layer.kind === "qr") {
    const side = Math.min(w, h);
    const pad = layer.light ? side * 0.06 : 0;
    return (
      <div aria-hidden style={{ position: "absolute", left: `${((w - side) / 2 / w) * 100}%`, top: `${((h - side) / 2 / h) * 100}%`, width: `${(side / w) * 100}%`, height: `${(side / h) * 100}%`, padding: `${(pad / w) * 100}%`, background: layer.light ? colour(layer.light) : undefined, opacity: alpha, lineHeight: 0, boxSizing: "border-box" }}>
        <QRCode value={holder.verifyUrl} style={{ width: "100%", height: "100%" }} bgColor={layer.light ? colour(layer.light) : "transparent"} fgColor={colour(layer.dark)} level="M" />
      </div>
    );
  }
  return null;
}
