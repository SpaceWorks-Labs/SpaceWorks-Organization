"use client";

import type { CSSProperties, ReactNode } from "react";
import QRCode from "react-qr-code";
import {
  CARD_LINE_HEIGHT,
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
} from "@/lib/cards/design/elements";
import { cardImageUrls, watermarkImageBox } from "@/lib/cards/layout";
import { resolveCardPalette, SYMBOL_ASSET } from "@/lib/cards/palette";
import { holderInitials, labelledLine, printableFields, validUntilLine, type CardBranding, type CardHolder } from "@/lib/cards/types";
import { SAFE_MARGIN_MM, useCanvasItems, type CanvasInteraction } from "./canvasInteraction";
import { CARD_FONT_FAMILY, cardFontStack, LayerFontFaces } from "./cardFonts";
import { CardLayerView, LayerSelection } from "./CardLayerView";
import { useNameSizePt } from "./useNameFit";

/**
 * One card side drawn to scale, matching the server-rendered PDF and PNG (lib/cards/layout.ts draws
 * the same boxes, palette and decor, and stacks items and layers in `settings.order`). With
 * `interaction`, items can be selected, dragged and nudged with the arrow keys, and layers resized and
 * turned; without it, it is a static preview. Include <CardFontFaces /> once per page.
 */
export function CardCanvas({ settings, holder, branding, pxPerMm = 1, interaction }: { settings: CardSideSettings; holder: CardHolder; branding: CardBranding; pxPerMm?: number; interaction?: CanvasInteraction }) {
  const px = (mm: number) => `${mm * pxPerMm}px`;
  const ptPx = (pt: number) => `${pt * PT_TO_MM * pxPerMm}px`;
  const itemProps = useCanvasItems(settings, pxPerMm, interaction);
  const bold = settings.elementBold;
  const fields = printableFields(settings, holder);
  const editing = Boolean(interaction);
  const palette = resolveCardPalette(settings, branding.orgAccent);
  const mono = settings.colorMode === "mono";
  const images = cardImageUrls(settings, branding, holder);
  const weight = (on: boolean) => (on ? 700 : 400);
  // Stacking: the background and watermark at 0, then items and layers in order.
  const stack = new Map(settings.order.map((key, index) => [key, index + 1]));
  const z = (key: string) => stack.get(key) ?? 1;
  const fontOf = (element: CardElement) => (settings.elementFonts as Partial<Record<CardElement, string>>)[element];

  const itemStyle = (element: CardElement, extra: CSSProperties = {}): CSSProperties => ({
    position: "absolute",
    left: px(settings.elementPositions[element].xMm),
    top: px(settings.elementPositions[element].yMm),
    cursor: editing ? "grab" : undefined,
    touchAction: editing ? "none" : undefined,
    userSelect: editing ? "none" : undefined,
    zIndex: z(element),
    ...(fontOf(element) ? { fontFamily: cardFontStack(fontOf(element)) } : {}),
    ...extra,
  });
  const line = (element: "role" | "plan" | "idNumber" | "validUntil", text: string, extra: CSSProperties = {}) =>
    text ? (
      <p {...itemProps(element)} style={itemStyle(element, { margin: 0, width: px(settings.elementSizes[element]), fontSize: ptPx(settings.elementTextSizes[element]), lineHeight: CARD_LINE_HEIGHT.body, fontWeight: weight(bold[element]), overflowWrap: "anywhere", ...extra })}>
        {text}
      </p>
    ) : null;

  const decor = cardTemplateDecor(settings.template, settings.widthMm, settings.heightMm);
  const namePt = useNameSizePt(settings, holder.displayName, nameSizePt(settings, holder.displayName), weight(bold.name), decor.nameTrackingEm, decor.nameUppercase);
  // On screen, rules stay at least one pixel wide so they never vanish in the preview.
  const rule = (mm: number, color: string) => `${Math.max(1, mm * pxPerMm)}px solid ${color}`;
  const cardStyle: CSSProperties = {
    width: px(settings.widthMm),
    height: px(settings.heightMm),
    position: "relative",
    backgroundColor: palette.background,
    color: palette.text,
    overflow: "hidden",
    fontFamily: CARD_FONT_FAMILY,
    lineHeight: CARD_LINE_HEIGHT.body,
    // The card edge: an outline takes no room, so items sit exactly where they print.
    outline: "1px solid rgb(20 44 42 / 14%)",
    backgroundImage: interaction?.showGrid
      ? "linear-gradient(to right, rgb(0 110 99 / 10%) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 110 99 / 10%) 1px, transparent 1px)"
      : undefined,
    backgroundSize: interaction?.showGrid ? `${settings.gridSizeMm * pxPerMm}px ${settings.gridSizeMm * pxPerMm}px` : undefined,
  };

  const label = settings.showCardLabel ? settings.cardLabel.trim() : "";
  const showHeader = label || settings.heading.trim();
  let headerDecor: CSSProperties = { color: palette.heading };
  if (decor.headerRule) headerDecor = { ...headerDecor, paddingBottom: px(decor.headerRule.gapMm), borderBottom: rule(decor.headerRule.ruleMm, palette.rule) };
  // Bold: the heading block is a solid band in the accent colour, with text picked for contrast.
  if (decor.band) headerDecor = { padding: `${px(decor.band.padYMm)} ${px(decor.band.padXMm)}`, background: palette.accent, color: palette.onAccent, borderRadius: px(decor.band.radiusMm) };

  const photoSide = settings.elementSizes.photo;
  const photoRadius = settings.photoShape === "circle" ? "50%" : px(photoSide * 0.2);
  const mark = settings.watermark;
  const markColour = mark.colour === "text" ? palette.text : palette.accent === palette.background ? palette.text : palette.accent;
  const markText = mark.kind === "text" ? mark.text.trim().toLocaleUpperCase("en") : "";
  const markBox = watermarkImageBox(settings.widthMm, settings.heightMm);
  const logoSide = settings.elementSizes.logo;

  const background = settings.background;
  let content: ReactNode = (
    <>
      {background.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the organisation's own background artwork
        <img aria-hidden src={background.imageUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: background.fit, opacity: background.opacityPct / 100, filter: mono ? "grayscale(1)" : undefined, pointerEvents: "none" }} />
      ) : null}
      {markText ? (
        <span aria-hidden style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) rotate(${mark.angleDeg}deg)`, fontSize: ptPx(watermarkSizePt(markText, settings.widthMm, settings.heightMm, mark.angleDeg)), fontWeight: 700, lineHeight: 1, letterSpacing: "0.04em", whiteSpace: "nowrap", color: markColour, opacity: mark.opacityPct / 100, pointerEvents: "none" }}>
          {markText}
        </span>
      ) : null}
      {images.watermark ? (
        // eslint-disable-next-line @next/next/no-img-element -- managed watermark upload drawn to scale
        <img aria-hidden src={images.watermark} alt="" draggable={false} style={{ position: "absolute", left: px(markBox.x), top: px(markBox.y), width: px(markBox.w), height: px(markBox.h), objectFit: "contain", opacity: mark.opacityPct / 100, filter: mono ? "grayscale(1)" : undefined, pointerEvents: "none" }} />
      ) : null}
      {decor.frame ? <span aria-hidden style={{ position: "absolute", inset: px(decor.frame.insetMm), border: rule(decor.frame.ruleMm, palette.rule), borderRadius: px(decor.frame.radiusMm), pointerEvents: "none" }} /> : null}
      {interaction ? <span aria-hidden style={{ position: "absolute", inset: px(SAFE_MARGIN_MM), border: "1px dashed rgb(0 110 99 / 40%)", pointerEvents: "none" }} /> : null}

      {showHeader ? (
        <div {...itemProps("header")} style={itemStyle("header", { width: px(settings.elementSizes.header), ...headerDecor })}>
          {label ? <p style={{ margin: `0 0 ${px(decor.labelGapMm)}`, fontSize: ptPx(cardLabelPt(settings.elementTextSizes.header)), lineHeight: CARD_LINE_HEIGHT.label, letterSpacing: "0.16em", fontWeight: weight(bold.header), overflowWrap: "anywhere" }}>{label}</p> : null}
          {settings.heading.trim() ? <p style={{ margin: 0, fontSize: ptPx(settings.elementTextSizes.header), fontWeight: weight(bold.header), lineHeight: CARD_LINE_HEIGHT.heading, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>{settings.heading}</p> : null}
        </div>
      ) : null}

      {settings.showName ? (
        <p {...itemProps("name")} style={itemStyle("name", { margin: 0, width: px(settings.elementSizes.name), fontSize: ptPx(namePt), fontWeight: weight(bold.name), lineHeight: CARD_LINE_HEIGHT.name, letterSpacing: `${decor.nameTrackingEm}em`, textTransform: decor.nameUppercase ? "uppercase" : undefined, overflowWrap: "anywhere" })}>
          {holder.displayName}
        </p>
      ) : null}

      {line("role", settings.showRole ? holder.role?.trim() ?? "" : "")}
      {line("plan", settings.showPlan ? holder.planName?.trim() ?? "" : "")}
      {line("idNumber", settings.showIdNumber ? labelledLine(settings.idNumberLabel, holder.idNumber) : "", { letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" })}
      {line("validUntil", settings.showValidUntil ? validUntilLine(settings.validUntilLabel, holder.validUntil) : "")}

      {fields.length > 0 ? (
        <div {...itemProps("details")} style={itemStyle("details", { width: px(settings.elementSizes.details), lineHeight: CARD_LINE_HEIGHT.body })}>
          {fields.map((detail) => {
            const fieldLabel = settings.printFieldLabels[detail.key] ?? detail.label;
            return (
              <div key={detail.key} style={{ display: "flex", justifyContent: fieldLabel ? "space-between" : "flex-start", gap: px(DETAILS_COLUMN_GAP_MM), marginTop: px(DETAILS_ROW_GAP_MM), fontSize: ptPx(settings.elementTextSizes.details), fontWeight: weight(bold.details) }}>
                {fieldLabel ? <span style={{ maxWidth: "50%", overflowWrap: "anywhere" }}>{fieldLabel}</span> : null}
                <span style={{ textAlign: fieldLabel ? "right" : "left", overflowWrap: "anywhere" }}>{detail.value}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {settings.showFooter && settings.footerText.trim() ? (
        <p {...itemProps("footer")} style={itemStyle("footer", { margin: 0, width: px(settings.elementSizes.footer), fontSize: ptPx(settings.elementTextSizes.footer), lineHeight: CARD_LINE_HEIGHT.body, fontWeight: weight(bold.footer || settings.template === "bold"), overflowWrap: "anywhere" })}>
          {settings.footerText}
        </p>
      ) : null}

      {images.organisationLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- managed logo upload drawn to scale
        <img {...itemProps("logo")} src={images.organisationLogo} alt="" draggable={false} style={itemStyle("logo", { width: px(logoSide), height: px(logoSide), objectFit: "contain", padding: px(TILE_PADDING_MM), borderRadius: px(Math.min(3, logoSide / 4)), background: palette.tile, filter: mono ? "grayscale(1)" : undefined, zIndex: z("logo") })} />
      ) : null}

      {settings.showPhoto ? (
        images.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the member's own uploaded photo
          <img {...itemProps("photo")} src={images.photo} alt="" draggable={false} style={itemStyle("photo", { width: px(photoSide), height: px(photoSide), objectFit: "cover", borderRadius: photoRadius, filter: mono ? "grayscale(1)" : undefined, zIndex: z("photo") })} />
        ) : (
          <div {...itemProps("photo")} style={itemStyle("photo", { width: px(photoSide), height: px(photoSide), borderRadius: photoRadius, background: palette.photoPlaceholder, color: palette.onPhotoPlaceholder, display: "grid", placeItems: "center", fontSize: ptPx((photoSide * 0.36) / PT_TO_MM), fontWeight: 700, lineHeight: 1, zIndex: z("photo") })}>
            {holderInitials(holder.displayName)}
          </div>
        )
      ) : null}

      {settings.showSymbol ? (
        // eslint-disable-next-line @next/next/no-img-element -- the unaltered Space Works master symbol
        <img {...itemProps("symbol")} src={SYMBOL_ASSET[palette.symbol]} alt="" draggable={false} style={itemStyle("symbol", { width: px(settings.elementSizes.symbol), height: px(settings.elementSizes.symbol), objectFit: "contain", zIndex: z("symbol") })} />
      ) : null}

      {settings.showQr ? (
        <div {...itemProps("qr")} style={itemStyle("qr", { background: palette.qrLight, padding: px(TILE_PADDING_MM), lineHeight: 0, zIndex: z("qr") })}>
          <QRCode value={holder.verifyUrl} size={Math.max(16, Math.round(settings.elementSizes.qr * pxPerMm))} bgColor={palette.qrLight} fgColor={palette.qrDark} level="M" />
        </div>
      ) : null}

      {settings.layers.map((layer) => <CardLayerView key={layer.id} layer={layer} holder={holder} pxPerMm={pxPerMm} zIndex={z(layer.id)} mono={mono} interaction={interaction} />)}
    </>
  );

  if (!interaction) content = <div aria-hidden>{content}</div>;
  const selectedLayer = interaction ? settings.layers.find((layer) => layer.id === interaction.selected) : undefined;
  const guide = (vertical: boolean): CSSProperties => ({ position: "absolute", pointerEvents: "none", background: "rgb(236 72 153)", ...(vertical ? { left: "50%", top: -8, bottom: -8, width: 1 } : { top: "50%", left: -8, right: -8, height: 1 }) });
  return (
    <div data-card-frame className="relative shrink-0" style={{ width: px(settings.widthMm), height: px(settings.heightMm) }}>
      <LayerFontFaces fonts={[...Object.values(settings.elementFonts), ...settings.layers.flatMap((layer) => (layer.kind === "text" ? [layer.font] : []))]} />
      <div data-card-preview style={cardStyle}>{content}</div>
      {interaction?.guides.x ? <span aria-hidden style={guide(true)} /> : null}
      {interaction?.guides.y ? <span aria-hidden style={guide(false)} /> : null}
      {selectedLayer && interaction ? <LayerSelection layer={selectedLayer} pxPerMm={pxPerMm} interaction={interaction} /> : null}
    </div>
  );
}
