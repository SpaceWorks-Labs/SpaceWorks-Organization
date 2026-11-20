import type { CardShapeType } from "../layerTypes";
import { grouped, idMaker, rectLayer, shapeLayer, shortSide, type Box, type LibraryCategory, type LibraryContext, type LibraryItem } from "./base";

/*
 * Bands, strips, corners and borders, placed on the card's edges. Every top band has a bottom
 * twin: the same shape at the foot of the card, flipped top to bottom (`flipY`), so the curve or
 * wave always faces into the card. Corners use one shape flipped into each corner.
 */

type Edge = "top" | "bottom";
const bandHeight = (ctx: LibraryContext) => shortSide(ctx) * 0.24;
const bandBox = (ctx: LibraryContext, edge: Edge, h = bandHeight(ctx), inset = 0): Box => ({ xMm: inset, yMm: edge === "top" ? 0 : ctx.heightMm - h, wMm: ctx.widthMm - inset * 2, hMm: h });
const EDGE_LABEL: Record<Edge, string> = { top: "Top", bottom: "Bottom" };

function band(kind: string, label: string, shape: CardShapeType | "solid" | "gradient", depthPct = 40): LibraryItem[] {
  return (["top", "bottom"] as const).map((edge) => ({
    id: `band-${kind}-${edge}`,
    label: `${EDGE_LABEL[edge]} ${label}`,
    keywords: `${edge === "top" ? "header" : "footer"} band ${kind}`,
    frame: "card",
    make: (ctx: LibraryContext) => {
      const id = idMaker(ctx);
      const name = `${EDGE_LABEL[edge]} band`;
      const flipY = edge === "bottom";
      if (shape === "solid") return [rectLayer(id, bandBox(ctx, edge), name, { fill: ctx.colours.primary, flipY })];
      if (shape === "gradient") {
        return [rectLayer(id, bandBox(ctx, edge), name, { fill: ctx.colours.primary, flipY, gradient: { type: "linear", angleDeg: 0, stops: [{ atPct: 0, color: ctx.colours.primary }, { atPct: 100, color: ctx.colours.secondary }] } })];
      }
      if (shape === "ribbon") {
        const h = shortSide(ctx) * 0.16;
        const box = { ...bandBox(ctx, edge, h, ctx.widthMm * 0.08), yMm: edge === "top" ? 3 : ctx.heightMm - 3 - h };
        return [shapeLayer(id, box, `${EDGE_LABEL[edge]} ribbon`, "ribbon", { fill: ctx.colours.primary, depthPct, flipY })];
      }
      return [shapeLayer(id, bandBox(ctx, edge), name, shape, { fill: ctx.colours.primary, depthPct, flipY })];
    },
  }));
}

function strip(edge: "left" | "right", gradient: boolean): LibraryItem {
  const label = `${edge === "left" ? "Left" : "Right"} strip${gradient ? ", gradient" : ""}`;
  return {
    id: `strip-${edge}${gradient ? "-gradient" : ""}`,
    label,
    keywords: "side band edge",
    frame: "card",
    make: (ctx) => {
      const w = ctx.widthMm * 0.07;
      const box = { xMm: edge === "left" ? 0 : ctx.widthMm - w, yMm: 0, wMm: w, hMm: ctx.heightMm };
      return [rectLayer(idMaker(ctx), box, label, {
        fill: ctx.colours.primary,
        flipX: edge === "right",
        gradient: gradient ? { type: "linear", angleDeg: 90, stops: [{ atPct: 0, color: ctx.colours.primary }, { atPct: 100, color: ctx.colours.secondary }] } : null,
      })];
    },
  };
}

const CORNERS = [
  { key: "top-left", label: "top left", flipX: false, flipY: false },
  { key: "top-right", label: "top right", flipX: true, flipY: false },
  { key: "bottom-left", label: "bottom left", flipX: false, flipY: true },
  { key: "bottom-right", label: "bottom right", flipX: true, flipY: true },
] as const;

function corners(shape: "corner" | "cornerRound", label: string): LibraryItem[] {
  return CORNERS.map((corner) => ({
    id: `${shape}-${corner.key}`,
    label: `${label}, ${corner.label}`,
    keywords: "corner accent",
    frame: "card",
    make: (ctx: LibraryContext) => {
      const size = shortSide(ctx) * 0.42;
      const box = { xMm: corner.flipX ? ctx.widthMm - size : 0, yMm: corner.flipY ? ctx.heightMm - size : 0, wMm: size, hMm: size };
      return [shapeLayer(idMaker(ctx), box, `${label} (${corner.label})`, shape, { fill: ctx.colours.primary, depthPct: 50, flipX: corner.flipX, flipY: corner.flipY })];
    },
  }));
}

/** A box `inset` mm in from the card's edge: frames are `depthPct` (at least 5) of its short side thick; thin borders are outlines. */
function frameBox(ctx: LibraryContext, inset: number): Box {
  return { xMm: inset, yMm: inset, wMm: ctx.widthMm - inset * 2, hMm: ctx.heightMm - inset * 2 };
}

const FRAMES: LibraryItem[] = [
  { id: "frame-edge", label: "Border", keywords: "frame outline edge", frame: "card", make: (ctx) => [shapeLayer(idMaker(ctx), frameBox(ctx, 0), "Border", "frame", { fill: ctx.colours.primary, depthPct: 5, radiusMm: 3 })] },
  { id: "frame-inset", label: "Thin inset border", keywords: "frame outline", frame: "card", make: (ctx) => [rectLayer(idMaker(ctx), frameBox(ctx, 2.5), "Inset border", { fill: null, stroke: ctx.colours.primary, strokeMm: 0.6, radiusMm: 2 })] },
  { id: "frame-rounded", label: "Rounded frame", keywords: "border outline", frame: "card", make: (ctx) => [shapeLayer(idMaker(ctx), frameBox(ctx, 3), "Rounded frame", "frame", { fill: ctx.colours.secondary, depthPct: 5, radiusMm: 6 })] },
  {
    id: "frame-double",
    label: "Double border",
    keywords: "frame outline",
    frame: "card",
    make: (ctx) => {
      const id = idMaker(ctx);
      return grouped([
        shapeLayer(id, frameBox(ctx, 0), "Outer border", "frame", { fill: ctx.colours.primary, depthPct: 5, radiusMm: 3 }),
        rectLayer(id, frameBox(ctx, 4.2), "Inner border", { fill: null, stroke: ctx.colours.primary, strokeMm: 0.4, radiusMm: 1.5 }),
      ]);
    },
  },
];

export const BANDS: LibraryCategory = {
  id: "bands",
  label: "Bands and borders",
  items: [
    ...band("solid", "band", "solid"),
    ...band("gradient", "gradient band", "gradient"),
    ...band("wave", "wave", "waveBand", 45),
    ...band("curve", "curve", "curveBand", 40),
    ...band("chevron", "chevron", "chevronBand", 40),
    ...band("diagonal", "diagonal", "diagonalBand", 50),
    ...band("ribbon", "ribbon", "ribbon", 30),
    strip("left", false),
    strip("right", false),
    strip("left", true),
    strip("right", true),
    ...corners("corner", "Corner"),
    ...corners("cornerRound", "Round corner"),
    ...FRAMES,
  ],
};
