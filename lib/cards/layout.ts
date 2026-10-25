import {
  CARD_LINE_HEIGHT,
  nameBlockHeightMm,
  cardLabelPt,
  cardTemplateDecor,
  DETAILS_COLUMN_GAP_MM,
  DETAILS_ROW_GAP_MM,
  nameSizePt,
  PT_TO_MM,
  TILE_PADDING_MM,
  watermarkSizePt,
  type CardElement,
  type CardSideSettings,
} from "./design/elements";
import { backgroundOps, layerOps } from "./layerLayout";
import { resolveCardPalette, SYMBOL_ASPECT, type CardSymbolVariant } from "./palette";
import { paragraph, type CardTextOp, type FontWeight, type TextMeasurer } from "./text";
import { holderInitials, labelledLine, printableFields, type CardBranding, type CardHolder } from "./types";

/*
 * Turns a card side, a member and the organisation's artwork into a flat list of drawing operations
 * in millimetres (top-left origin). The PDF and PNG renderers draw exactly these, so both outputs
 * match. It mirrors the browser canvas (components/cards/CardCanvas.tsx): same boxes, line heights,
 * template decor and palette. The background and watermark sit under everything; built-in items and
 * the side's own layers then stack in `settings.order`, bottom first.
 */

export type CardOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; radius: number; fill?: string; stroke?: string; strokeWidth?: number }
  | CardTextOp
  /**
   * `photo` marks the per-person photo, which renderers don't cache across cards. `alpha` keeps the
   * image's transparency (layer artwork); `radiusMm` rounds its corners.
   */
  | { kind: "image"; url: string; x: number; y: number; w: number; h: number; fit: "contain" | "cover"; shape: "none" | "circle" | "rounded"; grayscale: boolean; opacity?: number; photo?: true; alpha?: true; radiusMm?: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number }
  | { kind: "qr"; value: string; x: number; y: number; size: number; dark: string; light: string }
  | { kind: "symbol"; variant: CardSymbolVariant; x: number; y: number; w: number; h: number }
  /** A layer: its ops turned clockwise about (cx, cy) and faded together. */
  | { kind: "group"; rotateDeg: number; cx: number; cy: number; opacity: number; ops: CardOp[] };

export type CardScene = { widthMm: number; heightMm: number; background: string; ops: CardOp[] };

export type CardSceneInput = { settings: CardSideSettings; holder: CardHolder; branding: CardBranding; measurer: TextMeasurer };

const ptMm = (pt: number) => pt * PT_TO_MM;

/** Which artwork a side will draw, so callers can load only what is needed. */
export function cardImageUrls(settings: CardSideSettings, branding: CardBranding, holder?: Pick<CardHolder, "photoUrl">) {
  return {
    organisationLogo: settings.showLogo ? branding.organisationLogoUrl : null,
    photo: settings.showPhoto ? holder?.photoUrl ?? null : null,
    watermark: settings.watermark.kind === "image" ? branding.watermarkUrl : null,
  };
}

/** Where a watermark image sits: centred, within 70% of the card. */
export function watermarkImageBox(widthMm: number, heightMm: number) {
  const w = widthMm * 0.7;
  const h = heightMm * 0.7;
  return { x: (widthMm - w) / 2, y: (heightMm - h) / 2, w, h };
}

export function buildCardScene({ settings, holder, branding, measurer }: CardSceneInput): CardScene {
  const palette = resolveCardPalette(settings, branding.orgAccent);
  const mono = settings.colorMode === "mono";
  const decor = cardTemplateDecor(settings.template, settings.widthMm, settings.heightMm);
  const at = settings.elementPositions;
  const size = settings.elementSizes;
  const pt = settings.elementTextSizes;
  const bold = settings.elementBold;
  const weight = (on: boolean): FontWeight => (on ? 700 : 400);
  const font = settings.elementFonts;
  const ops: CardOp[] = [];
  const parts = new Map<CardElement, CardOp[]>();
  const part = (element: CardElement) => {
    let list = parts.get(element);
    if (!list) parts.set(element, (list = []));
    return list;
  };
  const images = cardImageUrls(settings, branding, holder);

  // The watermark sits under everything else.
  const mark = settings.watermark;
  const markColour = mark.colour === "text" ? palette.text : palette.accent === palette.background ? palette.text : palette.accent;
  if (mark.kind === "text" && mark.text.trim()) {
    const text = measurer.clean(mark.text.trim().toLocaleUpperCase("en"));
    const sizePt = watermarkSizePt(text, settings.widthMm, settings.heightMm, mark.angleDeg);
    const width = measurer.widthMm(text, 700, sizePt, 0.04);
    // Centre the text box on the card, then rotate its start point about the centre.
    const dx = -width / 2;
    const dy = ((measurer.ascent - measurer.descent) * ptMm(sizePt)) / 2;
    const angle = (mark.angleDeg * Math.PI) / 180;
    ops.push({
      kind: "text",
      x: settings.widthMm / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      baseline: settings.heightMm / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
      text, sizePt, weight: 700, color: markColour, trackingEm: 0.04, rotateDeg: mark.angleDeg, opacity: mark.opacityPct / 100,
    });
  } else if (images.watermark) {
    ops.push({ kind: "image", url: images.watermark, ...watermarkImageBox(settings.widthMm, settings.heightMm), fit: "contain", shape: "none", grayscale: mono, opacity: mark.opacityPct / 100 });
  }

  if (decor.frame) {
    const inset = decor.frame.insetMm;
    ops.push({ kind: "rect", x: inset, y: inset, w: settings.widthMm - 2 * inset, h: settings.heightMm - 2 * inset, radius: decor.frame.radiusMm, stroke: palette.rule, strokeWidth: decor.frame.ruleMm });
  }

  // Heading block: card label and heading, on the band (bold) or above a rule (classic).
  const label = settings.showCardLabel ? settings.cardLabel.trim() : "";
  const heading = settings.heading.trim();
  if (label || heading) {
    const band = decor.band;
    const innerX = at.header.xMm + (band ? band.padXMm : 0);
    const innerWidth = size.header - (band ? 2 * band.padXMm : 0);
    const color = band ? palette.onAccent : palette.heading;
    let cursor = at.header.yMm + (band ? band.padYMm : 0);
    const texts: CardOp[] = [];
    if (label) {
      const block = paragraph(measurer, label, innerX, cursor, innerWidth, { sizePt: cardLabelPt(pt.header), weight: weight(bold.header), color, trackingEm: 0.16, lineHeight: CARD_LINE_HEIGHT.label, font: font.header });
      texts.push(...block.ops);
      cursor = block.bottom + decor.labelGapMm;
    }
    if (heading) {
      const block = paragraph(measurer, heading, innerX, cursor, innerWidth, { sizePt: pt.header, weight: weight(bold.header), color, trackingEm: -0.01, lineHeight: CARD_LINE_HEIGHT.heading, font: font.header });
      texts.push(...block.ops);
      cursor = block.bottom;
    }
    const header = part("header");
    if (band) header.push({ kind: "rect", x: at.header.xMm, y: at.header.yMm, w: size.header, h: cursor + band.padYMm - at.header.yMm, radius: band.radiusMm, fill: palette.accent });
    header.push(...texts);
    if (decor.headerRule) header.push({ kind: "rect", x: at.header.xMm, y: cursor + decor.headerRule.gapMm, w: size.header, h: decor.headerRule.ruleMm, radius: 0, fill: palette.rule });
  }

  if (settings.showName) {
    const name = decor.nameUppercase ? holder.displayName.toLocaleUpperCase("en") : holder.displayName;
    const style = (sizePt: number) => ({ sizePt, weight: weight(bold.name), color: palette.text, trackingEm: decor.nameTrackingEm, lineHeight: CARD_LINE_HEIGHT.name, font: font.name });
    // The size estimate can miss on unusual scripts: with real measurements, shrink until the
    // wrapped name fits the room kept for it, so it never runs into the lines below.
    const room = nameBlockHeightMm(pt.name) + 0.01;
    const floor = pt.name * 0.3;
    let sizePt = nameSizePt(settings, holder.displayName);
    let block = paragraph(measurer, name, at.name.xMm, at.name.yMm, size.name, style(sizePt));
    while (settings.nameAutoFit && block.bottom - at.name.yMm > room && sizePt > floor) {
      sizePt = Math.max(floor, Math.round(sizePt * 9) / 10);
      block = paragraph(measurer, name, at.name.xMm, at.name.yMm, size.name, style(sizePt));
    }
    part("name").push(...block.ops);
  }

  const body = (element: "role" | "plan" | "idNumber" | "validUntil", text: string, trackingEm = 0) => {
    if (text) part(element).push(...paragraph(measurer, text, at[element].xMm, at[element].yMm, size[element], { sizePt: pt[element], weight: weight(bold[element]), color: palette.text, trackingEm, lineHeight: CARD_LINE_HEIGHT.body, font: font[element] }).ops);
  };
  body("role", settings.showRole ? holder.role?.trim() ?? "" : "");
  body("plan", settings.showPlan ? holder.planName?.trim() ?? "" : "");
  body("idNumber", settings.showIdNumber ? labelledLine(settings.idNumberLabel, holder.idNumber) : "", 0.02);
  body("validUntil", settings.showValidUntil ? labelledLine(settings.validUntilLabel, holder.validUntil) : "");

  const fields = printableFields(settings, holder);
  if (fields.length > 0) {
    const style = { sizePt: pt.details, weight: weight(bold.details), color: palette.text, lineHeight: CARD_LINE_HEIGHT.body, font: font.details };
    let cursor = at.details.yMm;
    const details = part("details");
    for (const field of fields) {
      cursor += DETAILS_ROW_GAP_MM;
      const fieldLabel = settings.printFieldLabels[field.key] ?? field.label;
      let labelWidth = 0;
      let rowBottom = cursor;
      if (fieldLabel) {
        labelWidth = Math.min(measurer.widthMm(measurer.clean(fieldLabel), style.weight, style.sizePt, 0, style.font), size.details * 0.5);
        const block = paragraph(measurer, fieldLabel, at.details.xMm, cursor, labelWidth + 0.01, style);
        details.push(...block.ops);
        rowBottom = block.bottom;
      }
      const valueX = fieldLabel ? at.details.xMm + labelWidth + DETAILS_COLUMN_GAP_MM : at.details.xMm;
      const value = paragraph(measurer, field.value, valueX, cursor, at.details.xMm + size.details - valueX, style, fieldLabel ? "right" : "left");
      details.push(...value.ops);
      cursor = Math.max(rowBottom, value.bottom);
    }
  }

  const footer = settings.showFooter ? settings.footerText.trim() : "";
  if (footer) {
    part("footer").push(...paragraph(measurer, footer, at.footer.xMm, at.footer.yMm, size.footer, {
      sizePt: pt.footer, weight: weight(bold.footer || settings.template === "bold"), color: palette.text, lineHeight: CARD_LINE_HEIGHT.body, font: font.footer,
    }).ops);
  }

  if (images.organisationLogo) {
    const side = size.logo;
    part("logo").push({ kind: "rect", x: at.logo.xMm, y: at.logo.yMm, w: side, h: side, radius: Math.min(3, side / 4), fill: palette.tile }, { kind: "image", url: images.organisationLogo, x: at.logo.xMm + TILE_PADDING_MM, y: at.logo.yMm + TILE_PADDING_MM, w: side - 2 * TILE_PADDING_MM, h: side - 2 * TILE_PADDING_MM, fit: "contain", shape: "none", grayscale: mono });
  }

  if (settings.showPhoto) {
    const side = size.photo;
    const shape = settings.photoShape;
    if (images.photo) {
      part("photo").push({ kind: "image", url: images.photo, x: at.photo.xMm, y: at.photo.yMm, w: side, h: side, fit: "cover", shape, grayscale: mono, photo: true });
    } else {
      part("photo").push({ kind: "rect", x: at.photo.xMm, y: at.photo.yMm, w: side, h: side, radius: shape === "circle" ? side / 2 : side * 0.2, fill: palette.photoPlaceholder });
      const initials = measurer.clean(holderInitials(holder.displayName)) || "?";
      const sizePt = (side * 0.36) / PT_TO_MM;
      const width = measurer.widthMm(initials, 700, sizePt);
      part("photo").push({
        kind: "text",
        x: at.photo.xMm + (side - width) / 2,
        baseline: at.photo.yMm + side / 2 + ((measurer.ascent - measurer.descent) * ptMm(sizePt)) / 2 - ptMm(sizePt) * 0.08,
        text: initials, sizePt, weight: 700, color: palette.onPhotoPlaceholder, trackingEm: 0,
      });
    }
  }

  if (settings.showSymbol) {
    const side = size.symbol;
    const h = side / SYMBOL_ASPECT;
    part("symbol").push({ kind: "symbol", variant: palette.symbol, x: at.symbol.xMm, y: at.symbol.yMm + (side - h) / 2, w: side, h });
  }

  if (settings.showQr) {
    part("qr").push({ kind: "rect", x: at.qr.xMm, y: at.qr.yMm, w: size.qr + 2 * TILE_PADDING_MM, h: size.qr + 2 * TILE_PADDING_MM, radius: 0, fill: palette.qrLight }, { kind: "qr", value: holder.verifyUrl, x: at.qr.xMm + TILE_PADDING_MM, y: at.qr.yMm + TILE_PADDING_MM, size: size.qr, dark: palette.qrDark, light: palette.qrLight });
  }

  const layers = new Map(settings.layers.map((layer) => [layer.id, layer]));
  const stacked = settings.order.flatMap((key) => {
    const layer = layers.get(key);
    return layer ? layerOps(layer, holder, measurer, mono) : parts.get(key as CardElement) ?? [];
  });
  return { widthMm: settings.widthMm, heightMm: settings.heightMm, background: palette.background, ops: [...backgroundOps(settings, mono), ...ops, ...stacked] };
}
