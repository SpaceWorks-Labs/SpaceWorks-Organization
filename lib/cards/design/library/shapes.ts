import type { CardShapeType } from "../layerTypes";
import { centred, ellipseLayer, idMaker, lineLayer, rectLayer, shapeLayer, shortSide, type LibraryCategory, type LibraryContext, type LibraryItem } from "./base";

/* Basic shapes, a third of the card's short side, centred, in the first brand colour. */

const square = (ctx: LibraryContext, share = 0.36) => centred(ctx, shortSide(ctx) * share, shortSide(ctx) * share);

function pathShape(id: string, label: string, shape: CardShapeType, options: { points?: number; depthPct?: number; wide?: boolean; keywords?: string; colour?: "primary" | "secondary" } = {}): LibraryItem {
  return {
    id,
    label,
    keywords: options.keywords,
    frame: "element",
    make: (ctx) => {
      const size = shortSide(ctx) * 0.36;
      const box = options.wide ? centred(ctx, size * 1.5, size) : square(ctx);
      return [shapeLayer(idMaker(ctx), box, label, shape, { fill: ctx.colours[options.colour ?? "primary"], points: options.points ?? 5, depthPct: options.depthPct ?? 50 })];
    },
  };
}

export const SHAPES: LibraryCategory = {
  id: "shapes",
  label: "Shapes",
  items: [
    { id: "rect", label: "Square", keywords: "rectangle box", frame: "element", make: (ctx) => [rectLayer(idMaker(ctx), square(ctx), "Square", { fill: ctx.colours.primary })] },
    { id: "rounded", label: "Rounded square", keywords: "rectangle box corners", frame: "element", make: (ctx) => [rectLayer(idMaker(ctx), square(ctx), "Rounded square", { fill: ctx.colours.primary, radiusMm: 3 })] },
    { id: "pill", label: "Pill", keywords: "rounded rectangle capsule", frame: "element", make: (ctx) => { const h = Math.round(shortSide(ctx) * 1.8) / 10; return [rectLayer(idMaker(ctx), centred(ctx, h * 3, h), "Pill", { fill: ctx.colours.primary, radiusMm: Math.round(h * 5) / 10 })]; } },
    { id: "circle", label: "Circle", keywords: "round dot", frame: "element", make: (ctx) => [ellipseLayer(idMaker(ctx), square(ctx), "Circle", { fill: ctx.colours.primary })] },
    { id: "ellipse", label: "Oval", keywords: "ellipse", frame: "element", make: (ctx) => { const h = shortSide(ctx) * 0.3; return [ellipseLayer(idMaker(ctx), centred(ctx, h * 1.6, h), "Oval", { fill: ctx.colours.primary })]; } },
    { id: "ring", label: "Ring", keywords: "circle outline", frame: "element", make: (ctx) => [ellipseLayer(idMaker(ctx), square(ctx), "Ring", { fill: null, stroke: ctx.colours.primary, strokeMm: 1 })] },
    pathShape("triangle", "Triangle", "triangle"),
    pathShape("right-triangle", "Right triangle", "rightTriangle"),
    pathShape("diamond", "Diamond", "diamond", { keywords: "rhombus" }),
    pathShape("pentagon", "Pentagon", "pentagon", { keywords: "polygon" }),
    pathShape("hexagon", "Hexagon", "hexagon", { keywords: "polygon" }),
    pathShape("octagon", "Octagon", "octagon", { keywords: "polygon" }),
    pathShape("star", "Star", "star", { points: 5, depthPct: 45 }),
    pathShape("star-6", "Six-point star", "star", { points: 6, depthPct: 55 }),
    pathShape("burst", "Burst", "burst", { points: 16, depthPct: 80, keywords: "starburst seal", colour: "secondary" }),
    pathShape("heart", "Heart", "heart", { keywords: "love", colour: "secondary" }),
    pathShape("arrow", "Arrow", "arrow", { wide: true, keywords: "pointer" }),
    pathShape("chevron", "Chevron", "chevron", { wide: true }),
    pathShape("cross", "Cross", "cross", { keywords: "plus" }),
    pathShape("speech", "Speech bubble", "speech", { wide: true, keywords: "callout talk" }),
    pathShape("shield", "Shield", "shield", { keywords: "crest" }),
    pathShape("badge", "Badge", "badge"),
    { id: "line", label: "Line", keywords: "rule stroke", frame: "element", make: (ctx) => [lineLayer(idMaker(ctx), centred(ctx, ctx.widthMm * 0.5, 0.5), "Line", ctx.colours.primary)] },
  ],
};
