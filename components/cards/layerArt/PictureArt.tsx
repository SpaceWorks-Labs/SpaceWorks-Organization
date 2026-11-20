"use client";

import type { CSSProperties } from "react";
import type { CardImageLayer, CardPhotoLayer } from "@/lib/cards/design/layerTypes";
import { pathD } from "@/lib/cards/design/path";
import { maskCmds } from "@/lib/cards/design/shapes";
import { cssFilter } from "@/lib/cards/imageArt";
import { PHOTO_PLACEHOLDER } from "@/lib/cards/layerOps/markOps";
import { relativeLuminance } from "@/lib/cards/palette";
import { holderInitials, type CardHolder } from "@/lib/cards/types";
import { ShadowPath, Svg } from "./VectorArt";

/*
 * Pictures and the member photo on the canvas. The server bakes crop, mask and adjustments into the
 * bitmap; here the same numbers become object-position, a scale about the focal point, a clip path
 * and CSS filters.
 */

type Colour = (hex: string) => string;

/** A mask as a CSS clip path in the box's own percentages. */
function clipPath(mask: CardImageLayer["mask"] | CardPhotoLayer["mask"], w: number, h: number) {
  if (mask === "none" || mask === "square") return undefined;
  if (mask === "circle") return "ellipse(50% 50% at 50% 50%)";
  if (mask === "rounded") return `inset(0 round ${Math.min(w, h) * 0.2 * (100 / w)}% / ${Math.min(w, h) * 0.2 * (100 / h)}%)`;
  return "polygon(100% 50%, 75% 100%, 25% 100%, 0% 50%, 25% 0%, 75% 0%)";
}

export function ImageArt({ layer, pxPerMm, mono, colour, alpha }: { layer: CardImageLayer; pxPerMm: number; mono: boolean; colour: Colour; alpha: number }) {
  const cover = layer.fit === "cover";
  const radius = cover && layer.mask === "none" ? layer.radiusMm * pxPerMm : 0;
  const style: CSSProperties = {
    display: "block", width: "100%", height: "100%", objectFit: layer.fit,
    objectPosition: cover ? `${layer.crop.xPct}% ${layer.crop.yPct}%` : undefined,
    transform: cover && layer.crop.zoom !== 1 ? `scale(${layer.crop.zoom})` : undefined,
    transformOrigin: `${layer.crop.xPct}% ${layer.crop.yPct}%`,
    filter: cssFilter(layer.adjust, mono || layer.grayscale, pxPerMm),
  };
  return (
    <>
      {layer.shadow ? (
        <Svg w={layer.wMm} h={layer.hMm}><ShadowPath outline={maskCmds(layer.mask === "none" ? "square" : layer.mask, layer.wMm, layer.hMm, cover ? layer.radiusMm : 0)} shadow={layer.shadow} colour={colour} alpha={alpha} /></Svg>
      ) : null}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius || undefined, clipPath: clipPath(layer.mask, layer.wMm, layer.hMm), opacity: alpha }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the organisation's own uploaded artwork, drawn to scale */}
        <img src={layer.url} alt={layer.alt} draggable={false} style={style} />
      </div>
    </>
  );
}

export function PhotoArt({ layer, holder, pxPerMm, mono, colour, alpha }: { layer: CardPhotoLayer; holder: CardHolder; pxPerMm: number; mono: boolean; colour: Colour; alpha: number }) {
  const outline = maskCmds(layer.mask, layer.wMm, layer.hMm);
  const fill = colour(layer.placeholder || PHOTO_PLACEHOLDER);
  const side = Math.min(layer.wMm, layer.hMm);
  return (
    <>
      {holder.photoUrl ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: clipPath(layer.mask, layer.wMm, layer.hMm), opacity: alpha }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the member's own uploaded photo */}
          <img src={holder.photoUrl} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", filter: mono ? "grayscale(1)" : undefined }} />
        </div>
      ) : (
        <>
          <Svg w={layer.wMm} h={layer.hMm}><path d={pathD(outline)} fill={fill} fillOpacity={alpha} /></Svg>
          <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700, lineHeight: 1, fontSize: side * 0.36 * pxPerMm, color: relativeLuminance(fill) > 0.4 ? "#142C2A" : "#FFFFFF", opacity: alpha }}>
            {holderInitials(holder.displayName)}
          </div>
        </>
      )}
      {layer.stroke && layer.strokeMm > 0 ? <Svg w={layer.wMm} h={layer.hMm}><path d={pathD(outline)} fill="none" stroke={colour(layer.stroke)} strokeWidth={layer.strokeMm} strokeOpacity={alpha} /></Svg> : null}
    </>
  );
}
