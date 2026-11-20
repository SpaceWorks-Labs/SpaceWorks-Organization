import {
  A6_PORTRAIT,
  bandInsetMm,
  CARD_LINE_HEIGHT,
  cardTemplateDecor,
  clamp,
  DEFAULT_LAYOUT_FLAGS,
  estimateHeaderHeightMm,
  layoutFlags,
  marginMm,
  nameBlockHeightMm,
  paperScale,
  PT_TO_MM,
  round1,
  symbolClearSpaceMm,
  type CardElementBold,
  type CardElementPositions,
  type CardElementSizes,
  type CardElementTextSizes,
  type CardLayoutFlags,
  type CardSideSettings,
  type CardTemplate,
} from "./elements";
import { qrCaptionHeightMm } from "./qrTile";

/*
 * Default boxes for a template on the given paper. Tuned on A6 portrait; smaller stock (the CR80 ID
 * card) scales margins and type with the paper. Content stacks from the top (heading, photo, name,
 * role, plan, number, valid until, answers); the QR sits bottom right, the symbol and footer along
 * the bottom left, so nothing overlaps on any preset.
 */

export function defaultElementBold(): CardElementBold {
  return {
    header: true, name: true, role: false, plan: false, details: false, qr: false, footer: false,
    logo: false, symbol: false, photo: false, idNumber: true, validUntil: false,
  };
}

export function defaultElementTextSizes(template: CardTemplate = "classic", widthMm = A6_PORTRAIT.widthMm, heightMm = A6_PORTRAIT.heightMm): CardElementTextSizes {
  // The name is always the largest thing on the card; the heading stays small.
  const base = template === "bold"
    ? { header: 14, name: 28, role: 10, plan: 8.5, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 }
    : template === "minimal"
      ? { header: 10, name: 30, role: 9.5, plan: 8.5, details: 8.5, footer: 7.5, idNumber: 10, validUntil: 8.5 }
      : { header: 13, name: 30, role: 10, plan: 8.5, details: 8.5, footer: 7.5, idNumber: 11, validUntil: 8.5 };
  const k = paperScale(widthMm, heightMm);
  const scaled = (pt: number, min: number) => Math.max(min, Math.round(pt * k * 2) / 2);
  return {
    header: scaled(base.header, 6), name: scaled(base.name, 9), role: scaled(base.role, 6), plan: scaled(base.plan, 6),
    details: scaled(base.details, 6), qr: 0, footer: scaled(base.footer, 6), logo: 0, symbol: 0, photo: 0,
    idNumber: scaled(base.idNumber, 6), validUntil: scaled(base.validUntil, 6),
  };
}

function defaultGeometry(template: CardTemplate, widthMm: number, heightMm: number, flags: CardLayoutFlags) {
  const k = paperScale(widthMm, heightMm);
  const m = marginMm(k);
  const decor = cardTemplateDecor(template, widthMm, heightMm);
  const text = defaultElementTextSizes(template, widthMm, heightMm);
  const line = (pt: number) => pt * PT_TO_MM * CARD_LINE_HEIGHT.body;
  const width = (mm: number) => Math.max(20, round1(mm));

  const qrSize = Math.min(40, Math.max(16, round1((template === "minimal" ? 21 : 24) * k)));
  const logoSize = Math.min(20, Math.max(10, round1((template === "minimal" ? 10 : 12) * k)));
  const symbolSize = clamp(round1(9 * k), 7, 14);
  // Portrait ID cards give the photo more of the width (about two fifths), as a passport-style card does.
  const tall = heightMm > widthMm * 1.15;
  const photoSize = clamp(round1(tall ? Math.min(widthMm * 0.4, 42 * k) : 24 * k), 12, 34);
  // The QR block has 1 mm of white padding; align the code itself with the margin. A caption under it
  // lifts the block by the caption's height.
  const caption = flags.showQrCaption ? qrCaptionHeightMm(qrSize) : 0;
  const qr = { xMm: round1(widthMm - m - qrSize - 1), yMm: round1(heightMm - m - qrSize - 1 - caption) };
  const qrLeft = qr.xMm + 1;

  const inset = bandInsetMm(k);
  const header = decor.band ? { xMm: inset, yMm: inset } : { xMm: m, yMm: m };
  const textX = decor.band ? round1(inset + decor.band.padXMm) : m;
  const leftOfQr = qrLeft - textX - 4 * k;

  // Bold keeps the band clean: its logo sits beside the QR at the bottom, or above the QR when the
  // card is too narrow to share the bottom row.
  let logo = { xMm: round1(widthMm - m - logoSize), yMm: m };
  let footerWidth = leftOfQr;
  if (template === "bold") {
    const besideX = qrLeft - 4 * k - logoSize;
    if (besideX - textX - 3 * k >= 30) {
      logo = { xMm: round1(besideX), yMm: round1(heightMm - m - logoSize) };
      footerWidth = besideX - textX - 3 * k;
    } else if (!flags.showSymbol) {
      // Too narrow to share: the logo takes the bottom left, level with the QR code.
      logo = { xMm: textX, yMm: round1(heightMm - m - logoSize) };
    } else {
      logo = { xMm: round1(widthMm - m - logoSize), yMm: round1(qr.yMm + 1 - 3 * k - logoSize) };
    }
  }
  const headerRight = template === "bold" ? widthMm - inset : flags.showLogo ? logo.xMm - 4 * k : widthMm - m;
  const headerWidth = decor.band ? width(headerRight - inset) : width(headerRight - textX);

  // Footer row: the symbol, its clear space, then the footer text beside it. On narrow stock the
  // footer needs the whole row, so the symbol stands above it.
  const footerLine = line(text.footer);
  const symbolGap = Math.max(symbolClearSpaceMm(symbolSize), round1(2 * k));
  const besideFooter = footerWidth - symbolSize - symbolGap >= 20;
  const plainFooter = { xMm: textX, yMm: round1(heightMm - m - footerLine) };
  const symbol = besideFooter
    ? { xMm: textX, yMm: round1(heightMm - m - symbolSize) }
    : { xMm: textX, yMm: round1(plainFooter.yMm - symbolGap - symbolSize) };
  const footer = flags.showSymbol && besideFooter
    ? { xMm: round1(textX + symbolSize + symbolGap), yMm: round1(heightMm - m - symbolSize / 2 - footerLine / 2) }
    : plainFooter;
  const footerBoxWidth = flags.showSymbol && besideFooter ? footerWidth - symbolSize - symbolGap : footerWidth;

  const headerBottom = header.yMm + estimateHeaderHeightMm(template, text.header, widthMm, heightMm);
  const nameRatio = template === "bold" ? 0.26 : template === "minimal" ? 0.36 : 0.3;
  const landscape = widthMm > heightMm * 1.15;
  let nameY = round1(Math.max(headerBottom + (template === "minimal" ? 8 : 6) * k, heightMm * nameRatio));
  let contentX = textX;
  let photo = { xMm: textX, yMm: round1(headerBottom + 4 * k) };
  if (flags.showPhoto) {
    if (landscape) {
      // Landscape: the photo stands beside the name block.
      photo = { xMm: textX, yMm: nameY };
      contentX = round1(textX + photoSize + 3 * k);
    } else {
      // Portrait: the photo sits under the heading and the name below it.
      nameY = round1(photo.yMm + photoSize + 3 * k);
    }
  } else if (landscape) {
    photo = { xMm: textX, yMm: nameY };
  }

  // Role, plan, number and valid-until stack under the name; each takes room only when shown.
  let y = round1(nameY + nameBlockHeightMm(text.name) + 1.5 * k);
  const roleY = y;
  if (flags.showRole) y = round1(y + line(text.role) + 1 * k);
  const planY = y;
  if (flags.showPlan) y = round1(y + line(text.plan) + 1 * k);
  const idNumberY = y;
  if (flags.showIdNumber) y = round1(y + line(text.idNumber) + 1 * k);
  const validUntilY = y;
  if (flags.showValidUntil) y = round1(y + line(text.validUntil));
  const detailsY = round1(y + 2 * k);

  // On landscape stock the QR sits beside the text, so text stops short of it.
  const full = widthMm - contentX - m;
  const nameWidth = width(landscape ? Math.min(full, leftOfQr - (contentX - textX)) : full);

  const positions: CardElementPositions = {
    header,
    name: { xMm: contentX, yMm: nameY },
    role: { xMm: contentX, yMm: roleY },
    plan: { xMm: contentX, yMm: planY },
    details: { xMm: contentX, yMm: detailsY },
    qr,
    footer,
    logo,
    symbol,
    photo,
    idNumber: { xMm: contentX, yMm: idNumberY },
    validUntil: { xMm: contentX, yMm: validUntilY },
  };
  const sizes: CardElementSizes = {
    header: headerWidth,
    name: nameWidth,
    role: nameWidth,
    plan: nameWidth,
    details: width(leftOfQr - (contentX - textX)),
    qr: qrSize,
    footer: width(footerBoxWidth),
    logo: logoSize,
    symbol: symbolSize,
    photo: photoSize,
    idNumber: nameWidth,
    validUntil: nameWidth,
  };
  return { positions, sizes };
}

/** Where an optional item goes when it is turned on, without reflowing the rest. */
export function geometryWithOptionalDefaults(template: CardTemplate, widthMm: number, heightMm: number, flags: CardLayoutFlags) {
  const base = defaultGeometry(template, widthMm, heightMm, flags);
  const optional = [["showSymbol", "symbol"], ["showPhoto", "photo"], ["showRole", "role"], ["showPlan", "plan"], ["showIdNumber", "idNumber"], ["showValidUntil", "validUntil"]] as const;
  for (const [flag, element] of optional) {
    if (flags[flag]) continue;
    const enabled = defaultGeometry(template, widthMm, heightMm, { ...flags, [flag]: true });
    base.positions[element] = enabled.positions[element];
    base.sizes[element] = enabled.sizes[element];
  }
  return base;
}

/** A fresh layout for `template` on the given paper: positions, sizes and text sizes together. */
export function layoutForPaper(template: CardTemplate, widthMm: number, heightMm: number, flags: CardLayoutFlags = DEFAULT_LAYOUT_FLAGS) {
  const geometry = geometryWithOptionalDefaults(template, widthMm, heightMm, flags);
  return {
    elementPositions: geometry.positions,
    elementSizes: geometry.sizes,
    elementTextSizes: defaultElementTextSizes(template, widthMm, heightMm),
    elementBold: defaultElementBold(),
  };
}

/** True when the layout is still exactly the default, so turning an item on may reflow the card. */
export function isDefaultLayout(settings: CardSideSettings, flags: CardLayoutFlags = layoutFlags(settings)) {
  const fresh = layoutForPaper(settings.template, settings.widthMm, settings.heightMm, flags);
  return JSON.stringify(fresh.elementPositions) === JSON.stringify(settings.elementPositions)
    && JSON.stringify(fresh.elementSizes) === JSON.stringify(settings.elementSizes);
}
