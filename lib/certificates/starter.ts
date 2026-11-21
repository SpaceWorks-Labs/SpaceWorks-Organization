import { round1 } from "@/lib/cards/design/elements";

/*
 * The layers a new certificate design starts with, laid out for any page: a double border, the organisation,
 * the title, the member's name, a citation, a date and signature line, and the verify QR code. Plain layer
 * objects; `normalizeLayers` checks them like any saved layer. Sizes scale with the short side of the page
 * (1 on A4's 210 mm), positions with the page.
 */

type Layer = Record<string, unknown> & { id: string; kind: string };

const INK = "#142C2A";
const ACCENT = "#006E63";

export function starterLayers(widthMm: number, heightMm: number): Layer[] {
  const k = Math.min(widthMm, heightMm) / 210;
  const margin = round1(20 * k);
  const inner = round1(widthMm - 2 * margin);
  const text = (id: string, name: string, value: string, y: number, h: number, extra: Record<string, unknown>): Layer => ({
    id, kind: "text", name, text: value, xMm: margin, yMm: round1(y), wMm: inner, hMm: round1(h), align: "center", color: INK, ...extra,
  });
  const lineY = round1(heightMm * 0.83);
  const lineW = round1(Math.min(60 * k, inner * 0.3));
  const caption = (id: string, name: string, value: string, x: number): Layer => ({
    id, kind: "text", name, text: value, xMm: round1(x), yMm: round1(lineY + 1.5), wMm: lineW, hMm: round1(6 * k), align: "center", sizePt: round1(9 * k), color: INK, font: "lora",
  });
  const rule = (id: string, name: string, x: number): Layer => ({ id, kind: "line", name, xMm: round1(x), yMm: lineY, wMm: lineW, hMm: 0.3, color: INK });
  const leftX = margin + 6 * k;
  const rightX = widthMm - margin - 6 * k - lineW;
  const qr = round1(24 * k);
  return [
    { id: "lborder", kind: "rect", name: "Border", xMm: round1(8 * k), yMm: round1(8 * k), wMm: round1(widthMm - 16 * k), hMm: round1(heightMm - 16 * k), fill: null, stroke: ACCENT, strokeMm: 1.4 },
    { id: "lborderin", kind: "rect", name: "Inner border", xMm: round1(11.5 * k), yMm: round1(11.5 * k), wMm: round1(widthMm - 23 * k), hMm: round1(heightMm - 23 * k), fill: null, stroke: ACCENT, strokeMm: 0.3 },
    text("lorg", "Organisation", "{organisation}", heightMm * 0.115, 9 * k, { sizePt: round1(14 * k), bold: true, textCase: "upper", trackingEm: 0.18, color: ACCENT }),
    text("ltitle", "Title", "{title}", heightMm * 0.18, 22 * k, { sizePt: round1(36 * k), font: "playfair-display", bold: true, autoFit: true }),
    text("lpresented", "Presented to", "This certificate is presented to", heightMm * 0.31, 8 * k, { sizePt: round1(13 * k), font: "lora" }),
    text("lname", "Member name", "{member.name}", heightMm * 0.37, 24 * k, { sizePt: round1(42 * k), font: "great-vibes", autoFit: true, color: ACCENT }),
    text("lreason", "Citation", "{reason}", heightMm * 0.52, 30 * k, { sizePt: round1(15 * k), font: "lora", lineHeight: 1.4, autoFit: true }),
    rule("ldateline", "Date line", leftX),
    { ...caption("ldatecap", "Date caption", "{date}", leftX), sizePt: round1(11 * k), bold: true },
    rule("lsignline", "Signature line", rightX),
    caption("lsigncap", "Signature caption", "Authorised signatory", rightX),
    { id: "lqrcode", kind: "qr", name: "Verify QR code", xMm: round1((widthMm - qr) / 2), yMm: round1(heightMm - 16 * k - qr), wMm: qr, hMm: qr, dark: INK, light: null },
    text("lnumber", "Certificate number", "{certificate.number}", heightMm - 16 * k - qr - 6 * k, 5 * k, { sizePt: round1(8 * k), color: INK, trackingEm: 0.08 }),
  ];
}
