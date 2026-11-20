import { barcodeLayer, centred, grouped, idMaker, lineLayer, photoLayer, qrLayer, shapeLayer, shortSide, type LibraryCategory, type LibraryContext, type LibraryItem } from "./base";
import type { CardLineLayer, CardPhotoLayer } from "../layerTypes";

/* Dividers, the card's codes as movable layers, and photo frames. */

const ruleWidth = (ctx: LibraryContext) => ctx.widthMm * 0.6;

function rule(dash: CardLineLayer["dash"], label: string): LibraryItem {
  return { id: `rule-${dash}`, label, keywords: "divider line rule", frame: "element", make: (ctx) => [lineLayer(idMaker(ctx), centred(ctx, ruleWidth(ctx), dash === "dotted" ? 0.6 : 0.4), label, ctx.colours.primary, dash)] };
}

export const DIVIDERS: LibraryCategory = {
  id: "dividers",
  label: "Dividers",
  items: [
    rule("solid", "Solid rule"),
    rule("dashed", "Dashed rule"),
    rule("dotted", "Dotted rule"),
    {
      id: "rule-double",
      label: "Double rule",
      keywords: "divider line",
      frame: "element",
      make: (ctx) => {
        const make = idMaker(ctx);
        const box = centred(ctx, ruleWidth(ctx), 0.4);
        return grouped([
          lineLayer(make, { ...box, yMm: box.yMm - 0.6 }, "Upper rule", ctx.colours.primary),
          lineLayer(make, { ...box, yMm: box.yMm + 0.6 }, "Lower rule", ctx.colours.primary),
        ]);
      },
    },
    {
      id: "rule-ornament",
      label: "Ornament rule",
      keywords: "divider diamond flourish",
      frame: "element",
      make: (ctx) => {
        const make = idMaker(ctx);
        const width = ruleWidth(ctx);
        const gem = 2.4;
        const box = centred(ctx, width, 0.4);
        const half = (width - gem - 2) / 2;
        return grouped([
          lineLayer(make, { ...box, wMm: half }, "Left rule", ctx.colours.primary),
          shapeLayer(make, centred(ctx, gem, gem), "Ornament", "diamond", { fill: ctx.colours.secondary }),
          lineLayer(make, { ...box, xMm: box.xMm + width - half, wMm: half }, "Right rule", ctx.colours.primary),
        ]);
      },
    },
  ],
};

export const CODES: LibraryCategory = {
  id: "codes",
  label: "QR and barcode",
  items: [
    { id: "qr", label: "QR code", keywords: "verify scan check", frame: "element", make: (ctx) => { const size = shortSide(ctx) * 0.36; return [qrLayer(idMaker(ctx), centred(ctx, size, size), ctx.colours)]; } },
    { id: "barcode", label: "Barcode", keywords: "card number code 128 scan", frame: "element", make: (ctx) => [barcodeLayer(idMaker(ctx), centred(ctx, shortSide(ctx) * 0.8, shortSide(ctx) * 0.26), ctx.colours)] },
  ],
};

function photo(mask: CardPhotoLayer["mask"], label: string, ring = false): LibraryItem {
  return {
    id: `photo-${mask}${ring ? "-ring" : ""}`,
    label,
    keywords: "photo picture portrait member face frame",
    frame: "element",
    make: (ctx) => {
      const size = shortSide(ctx) * 0.42;
      const box = mask === "rounded" || mask === "square" ? centred(ctx, size * 0.8, size) : centred(ctx, size, size);
      return [photoLayer(idMaker(ctx), box, label, mask, ring ? ctx.colours.primary : null)];
    },
  };
}

export const PHOTOS: LibraryCategory = {
  id: "photos",
  label: "Photo frames",
  items: [
    photo("circle", "Round photo"),
    photo("circle", "Round photo with ring", true),
    photo("rounded", "Rounded photo"),
    photo("rounded", "Rounded photo with ring", true),
    photo("hexagon", "Hexagon photo"),
    photo("square", "Square photo"),
  ],
};
