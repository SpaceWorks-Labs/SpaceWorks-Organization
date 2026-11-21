import { round1 } from "@/lib/cards/design/elements";
import { starterLayers } from "./starter";

/*
 * Ready-made certificate layouts the designer offers, built from plain layers for any page size and orientation:
 * the classic double border every new design starts with, a modern band across the top, and a minimal centred
 * page. Plain layer objects; normalising (`normalizeCertificateSide`) fills in the rest, as for any saved layer.
 * Sizes scale with the page's short side (1 on A4's 210 mm). Pure and client-safe.
 */

type Layer = Record<string, unknown> & { id: string; kind: string };

export const CERTIFICATE_LAYOUTS = [
  { id: "classic", label: "Classic border", description: "A double border, a script name and a centred QR code." },
  { id: "band", label: "Modern band", description: "A coloured band across the top, left-aligned text." },
  { id: "minimal", label: "Minimal", description: "Plenty of white space, a thin rule and quiet type." },
] as const;

export type CertificateLayoutId = (typeof CERTIFICATE_LAYOUTS)[number]["id"];

const INK = "#142C2A";
const MUTED = "#4A5D5B";
const ACCENT = "#006E63";
const ORANGE = "#FF7447";

function band(widthMm: number, heightMm: number): Layer[] {
  const k = Math.min(widthMm, heightMm) / 210;
  const margin = round1(18 * k);
  const bandH = round1(heightMm * 0.24);
  const wide = round1(widthMm - 2 * margin);
  const text = (id: string, name: string, value: string, y: number, h: number, extra: Record<string, unknown>): Layer => ({
    id, kind: "text", name, text: value, xMm: margin, yMm: round1(y), wMm: wide, hMm: round1(h), align: "left", color: INK, font: "montserrat", ...extra,
  });
  const nameY = heightMm * 0.37;
  const lineY = round1(heightMm * 0.84);
  const lineW = round1(Math.min(55 * k, wide * 0.3));
  const signX = round1(margin + lineW + 14 * k);
  const qr = round1(26 * k);
  return [
    { id: "lband", kind: "rect", name: "Band", xMm: 0, yMm: 0, wMm: round1(widthMm), hMm: bandH, fill: ACCENT, stroke: null },
    { id: "lbandedge", kind: "rect", name: "Band edge", xMm: 0, yMm: bandH, wMm: round1(widthMm), hMm: round1(2.5 * k), fill: ORANGE, stroke: null },
    text("lorg", "Organisation", "{organisation}", heightMm * 0.05, 8 * k, { sizePt: round1(12 * k), bold: true, textCase: "upper", trackingEm: 0.2, color: "#FFFFFF" }),
    text("ltitle", "Title", "{title}", heightMm * 0.1, 18 * k, { sizePt: round1(32 * k), bold: true, color: "#FFFFFF", autoFit: true }),
    text("lpresented", "Awarded to", "Awarded to", heightMm * 0.31, 7 * k, { sizePt: round1(11 * k), textCase: "upper", trackingEm: 0.16, color: MUTED }),
    text("lname", "Member name", "{member.name}", nameY, 22 * k, { sizePt: round1(40 * k), font: "dm-serif-display", autoFit: true }),
    { id: "lnamerule", kind: "line", name: "Name rule", xMm: margin, yMm: round1(nameY + 24 * k), wMm: round1(wide * 0.35), hMm: 0.6, color: ORANGE },
    { ...text("lreason", "Citation", "{reason}", nameY + 29 * k, 26 * k, { sizePt: round1(13 * k), font: "dm-sans", lineHeight: 1.45, autoFit: true }), wMm: round1(wide * 0.62) },
    { id: "ldateline", kind: "line", name: "Date line", xMm: margin, yMm: lineY, wMm: lineW, hMm: 0.3, color: INK },
    { ...text("ldate", "Date", "{date}", lineY - 7 * k, 6 * k, { sizePt: round1(11 * k), bold: true }), wMm: lineW },
    { ...text("ldatecap", "Date caption", "Date", lineY + 1.5 * k, 6 * k, { sizePt: round1(9 * k), color: MUTED }), wMm: lineW },
    { id: "lsignline", kind: "line", name: "Signature line", xMm: signX, yMm: lineY, wMm: lineW, hMm: 0.3, color: INK },
    { ...text("lsigncap", "Signature caption", "Authorised signatory", lineY + 1.5 * k, 6 * k, { sizePt: round1(9 * k), color: MUTED }), xMm: signX, wMm: lineW },
    { id: "lqrcode", kind: "qr", name: "Verify QR code", xMm: round1(widthMm - margin - qr), yMm: round1(heightMm - margin - qr), wMm: qr, hMm: qr, dark: INK, light: null },
    { ...text("lnumber", "Certificate number", "{certificate.number}", heightMm - margin - qr - 7 * k, 5 * k, { sizePt: round1(8 * k), align: "right", trackingEm: 0.08, color: MUTED }), xMm: round1(widthMm - margin - 70 * k), wMm: round1(70 * k) },
  ];
}

function minimal(widthMm: number, heightMm: number): Layer[] {
  const k = Math.min(widthMm, heightMm) / 210;
  const margin = round1(24 * k);
  const inner = round1(widthMm - 2 * margin);
  const text = (id: string, name: string, value: string, y: number, h: number, extra: Record<string, unknown>): Layer => ({
    id, kind: "text", name, text: value, xMm: margin, yMm: round1(y), wMm: inner, hMm: round1(h), align: "center", color: INK, font: "inter", ...extra,
  });
  const nameY = heightMm * 0.4;
  const reasonW = round1(inner * 0.75);
  const lineY = round1(heightMm * 0.82);
  const lineW = round1(Math.min(50 * k, inner * 0.28));
  const qr = round1(20 * k);
  return [
    text("lorg", "Organisation", "{organisation}", heightMm * 0.12, 7 * k, { sizePt: round1(10 * k), textCase: "upper", trackingEm: 0.24, color: MUTED }),
    { id: "lrule", kind: "line", name: "Rule", xMm: round1((widthMm - 20 * k) / 2), yMm: round1(heightMm * 0.19), wMm: round1(20 * k), hMm: 0.8, color: ACCENT },
    text("ltitle", "Title", "{title}", heightMm * 0.23, 14 * k, { sizePt: round1(24 * k), bold: true, textCase: "upper", trackingEm: 0.08, autoFit: true }),
    text("lname", "Member name", "{member.name}", nameY, 22 * k, { sizePt: round1(40 * k), font: "cormorant-garamond", bold: true, autoFit: true }),
    { ...text("lreason", "Citation", "{reason}", nameY + 26 * k, 24 * k, { sizePt: round1(12.5 * k), lineHeight: 1.5, color: MUTED, autoFit: true }), xMm: round1((widthMm - reasonW) / 2), wMm: reasonW },
    { id: "ldateline", kind: "line", name: "Date line", xMm: margin, yMm: lineY, wMm: lineW, hMm: 0.3, color: INK },
    { ...text("ldate", "Date", "{date}", lineY - 7 * k, 6 * k, { sizePt: round1(11 * k) }), wMm: lineW },
    { ...text("ldatecap", "Date caption", "Date", lineY + 1.5 * k, 6 * k, { sizePt: round1(8.5 * k), color: MUTED }), wMm: lineW },
    { id: "lsignline", kind: "line", name: "Signature line", xMm: round1(widthMm - margin - lineW), yMm: lineY, wMm: lineW, hMm: 0.3, color: INK },
    { ...text("lsigncap", "Signature caption", "Authorised signatory", lineY + 1.5 * k, 6 * k, { sizePt: round1(8.5 * k), color: MUTED }), xMm: round1(widthMm - margin - lineW), wMm: lineW },
    { id: "lqrcode", kind: "qr", name: "Verify QR code", xMm: round1((widthMm - qr) / 2), yMm: round1(lineY - qr / 2 - 3 * k), wMm: qr, hMm: qr, dark: INK, light: null },
    text("lnumber", "Certificate number", "{certificate.number}", lineY + qr / 2 - 1 * k, 5 * k, { sizePt: round1(7.5 * k), trackingEm: 0.08, color: MUTED }),
  ];
}

/** The layers of one layout at this page size. */
export function certificateLayoutLayers(id: CertificateLayoutId, widthMm: number, heightMm: number): Layer[] {
  if (id === "band") return band(widthMm, heightMm);
  if (id === "minimal") return minimal(widthMm, heightMm);
  return starterLayers(widthMm, heightMm);
}
