/*
 * The shapes of a card side's own layers (lib/cards/design/layers.ts normalises them). Every layer is
 * a box in millimetres, turned about its centre, optionally flipped, faded as a whole and optionally
 * part of a group (layers sharing a `groupId` select and move together). The designer canvas, the PNG
 * and the PDF draw every kind from the same geometry (lib/cards/design/shapes.ts, icons.ts,
 * barcode.ts), so the three always match.
 */

export const LAYER_KINDS = ["text", "image", "rect", "ellipse", "line", "shape", "icon", "qr", "barcode", "photo"] as const;
export type CardLayerKind = (typeof LAYER_KINDS)[number];

export const MAX_LAYERS = 60;
export const LAYER_TEXT_MAX = 400;
export const LAYER_ID_PATTERN = /^l[a-z0-9]{3,24}$/;
export const GROUP_ID_PATTERN = /^g[a-z0-9]{3,24}$/;

/** A colour stop: `atPct` along the gradient, 0–100. */
export type GradientStop = { atPct: number; color: string };
/** Linear runs along `angleDeg` (0 = left to right, 90 = top to bottom); radial spreads from the box centre. */
export type CardGradient = { type: "linear" | "radial"; angleDeg: number; stops: GradientStop[] };
export const GRADIENT_STOPS_MIN = 2;
export const GRADIENT_STOPS_MAX = 5;

export const PATTERN_KINDS = ["dots", "stripes", "grid", "waves"] as const;
export type CardPatternKind = (typeof PATTERN_KINDS)[number];
/** A vector texture drawn over the fill, clipped to the shape. `scaleMm` is the repeat. */
export type CardPattern = { kind: CardPatternKind; color: string; scaleMm: number; angleDeg: number };

/** A hard drop shadow: the layer's outline offset and filled, under it. */
export type CardShadow = { color: string; dxMm: number; dyMm: number; opacityPct: number };

type LayerBase = {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  rotationDeg: number;
  opacityPct: number;
  hidden: boolean;
  locked: boolean;
  /** Mirror left–right / top–bottom about the box centre (never applied to text). */
  flipX: boolean;
  flipY: boolean;
  /** Layers with the same group id select, move and resize together. */
  groupId: string | null;
};

/** Fill, gradient, texture, outline and shadow shared by every filled shape. A gradient replaces the fill. */
export type ShapePaint = {
  fill: string | null;
  gradient: CardGradient | null;
  pattern: CardPattern | null;
  stroke: string | null;
  strokeMm: number;
  shadow: CardShadow | null;
};

export const TEXT_CASES = ["none", "upper", "lower", "title"] as const;
export type CardTextCase = (typeof TEXT_CASES)[number];
export const TEXT_EFFECTS = ["none", "highlight", "outline", "hollow", "shadow"] as const;
export type CardTextEffect = (typeof TEXT_EFFECTS)[number];

export type CardTextLayer = LayerBase & {
  kind: "text";
  text: string;
  font: string;
  sizePt: number;
  bold: boolean;
  /** Kept for designs saved before `textCase`; normalising maps it to `textCase: "upper"`. */
  uppercase: boolean;
  textCase: CardTextCase;
  align: "left" | "center" | "right";
  color: string;
  trackingEm: number;
  lineHeight: number;
  /** Bend the first line along an arc: -100 (a smile turned down) to 100; 0 is straight. */
  curve: number;
  effect: CardTextEffect;
  /** The highlight, outline or shadow colour. */
  effectColor: string;
  /** Outline width or shadow offset in millimetres. */
  effectMm: number;
  /** Shrink the text until it fits the box height. */
  autoFit: boolean;
};

export const IMAGE_MASKS = ["none", "circle", "hexagon"] as const;
export type CardImageMask = (typeof IMAGE_MASKS)[number];
/** Picture adjustments, applied to the bitmap on the server before it is drawn (PNG and PDF alike). */
export type CardImageAdjust = { brightness: number; contrast: number; saturation: number; blur: number };
export const NO_ADJUST: CardImageAdjust = { brightness: 0, contrast: 0, saturation: 0, blur: 0 };
/** Crop of a filled picture: zoom 1–5 about a focal point (percent across and down the picture). */
export type CardImageCrop = { zoom: number; xPct: number; yPct: number };
export const NO_CROP: CardImageCrop = { zoom: 1, xPct: 50, yPct: 50 };

export type CardImageLayer = LayerBase & {
  kind: "image";
  url: string;
  fit: "cover" | "contain";
  radiusMm: number;
  grayscale: boolean;
  mask: CardImageMask;
  crop: CardImageCrop;
  adjust: CardImageAdjust;
  shadow: CardShadow | null;
  /** Describes the picture for people who can't see it. */
  alt: string;
};

export type CardShapeLayer = LayerBase & ShapePaint & { kind: "rect" | "ellipse"; radiusMm: number };

/** A straight rule: `hMm` is its thickness; turn it for diagonals. */
export type CardLineLayer = LayerBase & { kind: "line"; color: string; dash: "solid" | "dashed" | "dotted" };

export const SHAPE_TYPES = [
  "triangle", "rightTriangle", "diamond", "pentagon", "hexagon", "octagon", "star", "burst", "heart", "arrow", "chevron", "shield", "badge",
  "speech", "cross", "waveBand", "curveBand", "chevronBand", "diagonalBand", "ribbon", "corner", "cornerRound", "frame", "path",
] as const;
export type CardShapeType = (typeof SHAPE_TYPES)[number];
export const SHAPE_PATH_MAX = 400;

export type CardPathShapeLayer = LayerBase & ShapePaint & {
  kind: "shape";
  shape: CardShapeType;
  /** Corner count for stars and bursts (3–24). */
  points: number;
  /** A star's inner radius as a share of its outer one, or a band's or frame's depth, 5–95. */
  depthPct: number;
  /** Rounding for frames (mm). */
  radiusMm: number;
  /** Only for `shape: "path"`: M/L/C/Q/Z commands with coordinates 0–100 (percent of the box). */
  path: string;
};

export type CardIconLayer = LayerBase & { kind: "icon"; icon: string; color: string; strokeMm: number };

/** The card's own check QR code (the verify URL); drawn square in the box. */
export type CardQrLayer = LayerBase & { kind: "qr"; dark: string; light: string | null };
/** The card number as a Code 128 barcode, with the number printed under it when `showText`. */
export type CardBarcodeLayer = LayerBase & { kind: "barcode"; color: string; background: string | null; showText: boolean };

export const PHOTO_MASKS = ["circle", "rounded", "hexagon", "square"] as const;
export type CardPhotoMask = (typeof PHOTO_MASKS)[number];
/** The member's photo (initials when there is none), masked to a shape and optionally ringed. */
export type CardPhotoLayer = LayerBase & { kind: "photo"; mask: CardPhotoMask; stroke: string | null; strokeMm: number; placeholder: string };

export type CardLayer =
  | CardTextLayer
  | CardImageLayer
  | CardShapeLayer
  | CardLineLayer
  | CardPathShapeLayer
  | CardIconLayer
  | CardQrLayer
  | CardBarcodeLayer
  | CardPhotoLayer;

export type CardBackground = { imageUrl: string | null; fit: "cover" | "contain"; opacityPct: number };
export const DEFAULT_BACKGROUND: CardBackground = { imageUrl: null, fit: "cover", opacityPct: 100 };

/** Kinds whose box may be flipped (text never mirrors). */
export function canFlip(layer: Pick<CardLayer, "kind">) {
  return layer.kind !== "text" && layer.kind !== "qr" && layer.kind !== "barcode";
}

/** What every new layer starts with apart from its id, kind and box. */
export const LAYER_DEFAULTS = { name: "", rotationDeg: 0, opacityPct: 100, hidden: false, locked: false, flipX: false, flipY: false, groupId: null } as const;
/** A plain filled shape with no outline, gradient, texture or shadow. */
export const PAINT_DEFAULTS: ShapePaint = { fill: "#006E63", gradient: null, pattern: null, stroke: null, strokeMm: 0.5, shadow: null };
/** Text settings for a new text layer, before its words, font, size and colour. */
export const TEXT_DEFAULTS = { bold: false, uppercase: false, textCase: "none", align: "left", trackingEm: 0, lineHeight: 1.2, curve: 0, effect: "none", effectColor: "#FFFFFF", effectMm: 0.3, autoFit: false } as const;
