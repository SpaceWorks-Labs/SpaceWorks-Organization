import { contrastRatio } from "@/lib/theme/accent";
import { BRAND } from "@/lib/cards/palette";
import { PT_TO_MM } from "../elements";
import { centred, ellipseLayer, grouped, idMaker, rectLayer, shapeLayer, shortSide, textLayer, type Box, type LibraryCategory, type LibraryContext, type LibraryItem, r1 } from "./base";

/*
 * Badges and stickers: a shape with words on it, grouped so they move together. The words are
 * ordinary text layers, so they can be edited like any other, and are white or Deep Ink, whichever
 * reads better on the shape.
 */

export const onColour = (fill: string) => (contrastRatio(fill, BRAND.white) >= 4.5 ? BRAND.white : BRAND.ink);

/** A one-line text box `sizePt` high, centred down `box`. */
function centredLine(box: Box, sizePt: number, inset = 0): Box {
  const hMm = sizePt * PT_TO_MM * 1.2;
  return { xMm: box.xMm + inset, yMm: box.yMm + (box.hMm - hMm) / 2, wMm: box.wMm - inset * 2, hMm };
}

function tag(id: string, label: string, word: string, colour: "primary" | "secondary" | "tertiary"): LibraryItem {
  return {
    id,
    label,
    keywords: "tag label pill sticker",
    frame: "element",
    make: (ctx: LibraryContext) => {
      const make = idMaker(ctx);
      const h = shortSide(ctx) * 0.14;
      const box = centred(ctx, h * 3.4, h);
      const fill = ctx.colours[colour];
      return grouped([
        rectLayer(make, box, `${word} tag`, { fill, radiusMm: r1(h / 2) }),
        textLayer(make, centredLine(box, 7), `${word} tag text`, { text: word, color: onColour(fill), sizePt: 7, bold: true, textCase: "upper", trackingEm: 0.12, align: "center" }),
      ]);
    },
  };
}

export const BADGES: LibraryCategory = {
  id: "badges",
  label: "Badges and stickers",
  items: [
    {
      id: "seal",
      label: "Round seal",
      keywords: "stamp emblem burst official",
      frame: "element",
      make: (ctx) => {
        const make = idMaker(ctx);
        const size = shortSide(ctx) * 0.44;
        const box = centred(ctx, size, size);
        const inner = { xMm: box.xMm + size * 0.12, yMm: box.yMm + size * 0.12, wMm: size * 0.76, hMm: size * 0.76 };
        const star = centred(ctx, size * 0.24, size * 0.24);
        return grouped([
          shapeLayer(make, box, "Seal edge", "burst", { fill: ctx.colours.primary, points: 20, depthPct: 88 }),
          ellipseLayer(make, inner, "Seal centre", { fill: BRAND.white, stroke: ctx.colours.primary, strokeMm: 0.4 }),
          shapeLayer(make, { ...star, yMm: star.yMm + size * 0.08 }, "Seal star", "star", { fill: ctx.colours.secondary, points: 5, depthPct: 45 }),
          textLayer(make, { xMm: inner.xMm + size * 0.06, yMm: inner.yMm + size * 0.07, wMm: inner.wMm - size * 0.12, hMm: size * 0.2 }, "Seal words", { text: "Official member", color: BRAND.ink, sizePt: 5.5, bold: true, textCase: "upper", trackingEm: 0.08, align: "center", curve: 60 }),
        ]);
      },
    },
    {
      id: "ribbon-banner",
      label: "Ribbon banner",
      keywords: "banner ribbon title",
      frame: "element",
      make: (ctx) => {
        const make = idMaker(ctx);
        const h = shortSide(ctx) * 0.2;
        const box = centred(ctx, shortSide(ctx) * 0.8, h);
        return grouped([
          shapeLayer(make, box, "Ribbon", "ribbon", { fill: ctx.colours.primary, depthPct: 30 }),
          textLayer(make, centredLine(box, 9, box.wMm * 0.15), "Ribbon words", { text: "Member", color: onColour(ctx.colours.primary), sizePt: 9, bold: true, textCase: "upper", trackingEm: 0.1, align: "center" }),
        ]);
      },
    },
    tag("tag-member", "Member tag", "Member", "primary"),
    tag("tag-verified", "Verified tag", "Verified", "tertiary"),
    tag("tag-staff", "Staff tag", "Staff", "secondary"),
    {
      id: "sticker-star",
      label: "Star sticker",
      keywords: "burst sticker new",
      frame: "element",
      make: (ctx) => {
        const make = idMaker(ctx);
        const size = shortSide(ctx) * 0.34;
        const box = centred(ctx, size, size);
        return grouped([
          shapeLayer(make, box, "Sticker", "burst", { fill: ctx.colours.secondary, points: 12, depthPct: 75 }),
          textLayer(make, centredLine(box, 7, size * 0.15), "Sticker words", { text: "Member", color: onColour(ctx.colours.secondary), sizePt: 7, bold: true, textCase: "upper", align: "center", rotationDeg: -12 }),
        ]);
      },
    },
  ],
};
