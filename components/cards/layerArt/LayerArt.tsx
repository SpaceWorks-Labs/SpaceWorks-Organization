"use client";

import { canFlip, type CardLayer } from "@/lib/cards/design/layerTypes";
import { monoColour } from "@/lib/cards/layerLayout";
import type { CardHolder } from "@/lib/cards/types";
import { ImageArt, PhotoArt } from "./PictureArt";
import { TextArt } from "./TextArt";
import { VectorArt } from "./VectorArt";

/**
 * What one layer looks like inside its box, drawn as the server renderer draws it (lib/cards/
 * layerLayout.ts): the same geometry, mirrored when flipped, each part faded by the layer's opacity.
 * The caller positions and turns the box (without fading it); this fills it. No interaction.
 */
export function LayerArt({ layer, holder, pxPerMm, mono }: { layer: CardLayer; holder: CardHolder; pxPerMm: number; mono: boolean }) {
  const colour = (hex: string) => (mono ? monoColour(hex) : hex);
  const alpha = layer.opacityPct / 100;
  let art;
  if (layer.kind === "text") art = <TextArt layer={layer} holder={holder} pxPerMm={pxPerMm} mono={mono} alpha={alpha} />;
  else if (layer.kind === "image") art = <ImageArt layer={layer} pxPerMm={pxPerMm} mono={mono} colour={colour} alpha={alpha} />;
  else if (layer.kind === "photo") art = <PhotoArt layer={layer} holder={holder} pxPerMm={pxPerMm} mono={mono} colour={colour} alpha={alpha} />;
  else art = <VectorArt layer={layer} holder={holder} colour={colour} alpha={alpha} />;
  const flip = canFlip(layer) && (layer.flipX || layer.flipY) ? `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})` : undefined;
  return <div aria-hidden style={{ position: "absolute", inset: 0, transform: flip }}>{art}</div>;
}
