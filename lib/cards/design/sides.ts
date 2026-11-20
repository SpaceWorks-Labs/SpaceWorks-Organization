import { CARD_LINE_HEIGHT, estimateEmWidth, marginMm, paperScale, PT_TO_MM, round1 } from "./elements";
import type { layoutForPaper } from "./geometry";

/*
 * Building blocks for the built-in designs (presets.ts, templates.ts): layer shorthands, the units line
 * under the role, and the standard back — the plan, number and validity at the top, the organisation's
 * contact details, a line for an authorised signature, and the verification note along the bottom.
 * Layers carry fixed colours, so callers pass the text colour the side's palette resolves to.
 */

export type Layer = Record<string, unknown> & { id: string; kind: string };
type Layout = ReturnType<typeof layoutForPaper>;

export const shape = (id: string, kind: "rect" | "ellipse", x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Layer => ({ id, kind, xMm: x, yMm: y, wMm: w, hMm: h, ...extra });
export const line = (id: string, x: number, y: number, w: number, thickness: number, color: string, extra: Record<string, unknown> = {}): Layer => ({ id, kind: "line", xMm: x, yMm: y, wMm: w, hMm: thickness, color, ...extra });
export const text = (id: string, value: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown>): Layer => ({ id, kind: "text", text: value, xMm: x, yMm: y, wMm: w, hMm: h, ...extra });

const lineMm = (pt: number) => pt * PT_TO_MM * CARD_LINE_HEIGHT.body;

/**
 * The member's units ("North · North 1", the `{units}` placeholder) on the line under the role. Plan,
 * number, validity and answers move down one line to make room. A member without units prints nothing there.
 */
export function unitsLine(layout: Layout, widthMm: number, heightMm: number, color: string, id: string): Layer {
  const at = layout.elementPositions;
  const sizePt = layout.elementTextSizes.plan;
  const step = round1(lineMm(sizePt) + paperScale(widthMm, heightMm));
  const units = text(id, "{units}", at.plan.xMm, at.plan.yMm, layout.elementSizes.plan, round1(lineMm(sizePt)), { name: "Units", sizePt, bold: true, color, lineHeight: CARD_LINE_HEIGHT.body });
  for (const item of ["plan", "idNumber", "validUntil", "details"] as const) at[item] = { ...at[item], yMm: round1(at[item].yMm + step) };
  return units;
}

/**
 * The standard back on `layout` (a layout with the symbol and no photo, name or QR): plan, number and
 * validity where the name would be, then the contact line, a signature line, and the note `footerText`
 * across the bottom beside the symbol. Changes `layout` in place and returns the layers it adds.
 */
export function standardBack(layout: Layout, widthMm: number, heightMm: number, footerText: string, color: string, prefix: string): Layer[] {
  const k = paperScale(widthMm, heightMm);
  const m = marginMm(k);
  const at = layout.elementPositions;
  const sizes = layout.elementSizes;
  const pt = layout.elementTextSizes;

  // The back prints no name: start the plan, number and answers where the name would be.
  const up = at.plan.yMm - at.name.yMm;
  for (const item of ["plan", "idNumber", "validUntil", "details"] as const) at[item] = { ...at[item], yMm: round1(at[item].yMm - up) };
  const textX = at.plan.xMm;
  const full = round1(widthMm - textX - m);
  for (const item of ["plan", "idNumber", "validUntil"] as const) sizes[item] = full;

  // The note: as wide as the row allows (the logo may share the bottom row), lifted by its own lines.
  const logoOnBottom = at.logo.yMm + sizes.logo > heightMm - m - 1 && at.logo.xMm > widthMm / 2;
  const symbolBeside = at.symbol.yMm + sizes.symbol > heightMm - m - 0.5;
  const footerX = symbolBeside ? at.footer.xMm : textX;
  const right = logoOnBottom ? at.logo.xMm - 3 * k : widthMm - m;
  const footerWidth = round1(right - footerX);
  const lines = Math.max(1, Math.ceil((estimateEmWidth(footerText, false) * pt.footer * PT_TO_MM * 1.08) / footerWidth));
  const footerTop = round1(heightMm - m - lines * lineMm(pt.footer));
  at.footer = { xMm: footerX, yMm: footerTop };
  sizes.footer = Math.max(20, footerWidth);
  if (symbolBeside) at.symbol = { ...at.symbol, yMm: round1(Math.min(at.symbol.yMm, footerTop + (lines * lineMm(pt.footer) - sizes.symbol) / 2)) };
  else at.symbol = { ...at.symbol, yMm: round1(footerTop - Math.max(2 * k, 1.5) - sizes.symbol) };
  const blockTop = Math.min(footerTop, at.symbol.yMm);

  const layers: Layer[] = [];
  const contactTop = round1(at.validUntil.yMm + lineMm(pt.validUntil) + 1.5 * k);
  const contactPt = pt.footer;
  layers.push(text(`${prefix}contact`, "{contact}", textX, contactTop, full, round1(lineMm(contactPt) * 2), { name: "Contact details", sizePt: contactPt, bold: true, color, lineHeight: CARD_LINE_HEIGHT.body }));

  // An authorised signature: a hairline with its caption, just above the note, when there is room.
  const captionPt = Math.max(5.5, round1(pt.footer * 0.85));
  const signTop = round1(blockTop - 2.5 * k - lineMm(captionPt) - 0.3);
  const signWidth = round1(Math.min(32, (widthMm - 2 * m) * 0.5));
  if (signTop - 5 * k > contactTop + lineMm(contactPt) * 2) {
    layers.push(line(`${prefix}sign`, textX, signTop, signWidth, 0.2, color, { name: "Signature line", opacityPct: 70 }));
    layers.push(text(`${prefix}signcap`, "Authorised signatory", textX, round1(signTop + 0.6), signWidth, round1(lineMm(captionPt)), { name: "Signature caption", sizePt: captionPt, color, lineHeight: CARD_LINE_HEIGHT.body }));
  }
  return layers;
}

/** The note on the standard back. */
export function backNote(organisationName: string) {
  const name = organisationName.trim() || "the organisation named on the front";
  return `This card belongs to ${name}. Scan the QR code on the front to check it is current. If found, please return it.`.slice(0, 240);
}
