import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { currencyExponent, isCurrencyCode } from "@/lib/money/currencies";
import { indianStateName } from "@/lib/indianStates";
import type { DocumentSnapshot } from "./documents";
import { DOCUMENT_KIND_LABELS } from "./numbering";

/*
 * Tax documents are drawn from their frozen snapshot with pdf-lib, in Gilroy from the brand fonts.
 * Not Outfit (CR-TYPE-01 for screens): the kit ships Outfit only as a variable font whose default instance is
 * Thin (wght 100), and pdf-lib embeds font bytes as given (no variation instancing), so it would draw hairline
 * text. Gilroy Light and ExtraBold are static faces at their real weights. Swap when a static Outfit ships.
 * Amounts are written with the ISO code ("INR 1,180.00"): unambiguous on a tax document and safe in any
 * font. Characters the font lacks are replaced rather than dropped silently.
 */

const FONT_DIR = path.join(process.cwd(), "public", "brand", "fonts");
const INK = rgb(0.09, 0.11, 0.1);
const MUTED = rgb(0.38, 0.4, 0.39);
const RULE = rgb(0.85, 0.86, 0.85);
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

let fonts: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;
function loadFonts() {
  fonts ??= Promise.all([readFile(path.join(FONT_DIR, "Gilroy-Light.woff2")), readFile(path.join(FONT_DIR, "Gilroy-ExtraBold.woff2"))]).then(([regular, bold]) => ({ regular, bold }));
  return fonts;
}

const FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "₹": "INR " };

function safe(font: PDFFont, text: string) {
  const glyphs = new Set(font.getCharacterSet());
  return Array.from(text.normalize("NFC")).map((char) => (glyphs.has(char.codePointAt(0)!) ? char : FALLBACK[char] ?? "?")).join("");
}

export function documentAmount(minor: number, currency: string, locale: string | null) {
  const exponent = isCurrencyCode(currency) ? currencyExponent(currency) : 2;
  const value = new Intl.NumberFormat(locale ?? (currency === "INR" ? "en-IN" : "en-GB"), { minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(minor / 10 ** exponent);
  return `${currency} ${value}`;
}

function date(iso: string | null, timeZone: string) {
  return iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso)) : "—";
}

type Pen = { page: PDFPage; regular: PDFFont; bold: PDFFont };

function text(pen: Pen, value: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; maxWidth?: number } = {}) {
  const font = options.bold ? pen.bold : pen.regular;
  const size = options.size ?? 9.5;
  let line = safe(font, value);
  if (options.maxWidth) while (line.length > 1 && font.widthOfTextAtSize(line, size) > options.maxWidth) line = `${line.slice(0, -2)}…`.replace(/……$/, "…");
  const width = font.widthOfTextAtSize(line, size);
  pen.page.drawText(line, { x: options.align === "right" ? x - width : x, y, size, font, color: options.color ?? INK });
}

function columnsFor(snapshot: DocumentSnapshot) {
  const { mode, rateBps } = snapshot.tax;
  if (mode === "NONE" || rateBps === 0) return [] as Array<{ key: "cgstMinor" | "sgstMinor" | "igstMinor" | "otherTaxMinor"; label: string }>;
  if (mode === "SIMPLE") return [{ key: "otherTaxMinor" as const, label: `${snapshot.tax.taxName} ${rateBps / 100}%` }];
  const intra = snapshot.totals.cgstMinor > 0 || snapshot.totals.sgstMinor > 0;
  return intra
    ? [{ key: "cgstMinor" as const, label: `CGST ${rateBps / 200}%` }, { key: "sgstMinor" as const, label: `SGST ${rateBps / 200}%` }]
    : [{ key: "igstMinor" as const, label: `IGST ${rateBps / 100}%` }];
}

function notes(snapshot: DocumentSnapshot) {
  const lines: string[] = [];
  if (snapshot.kind === "CREDIT_NOTE" && snapshot.original) lines.push(`Issued against ${snapshot.original.number} dated ${date(snapshot.original.issuedAt, snapshot.timeZone)}.`);
  if (snapshot.tax.zeroRatedExport) lines.push(`Supply meant for export under LUT${snapshot.tax.lutNumber ? ` ${snapshot.tax.lutNumber}` : ""} without payment of integrated tax.`);
  if (snapshot.kind === "BILL_OF_SUPPLY") lines.push("Bill of supply: no tax is charged on this supply.");
  if (snapshot.kind === "RECEIPT" && snapshot.tax.mode !== "SIMPLE") lines.push("This is a receipt, not a tax invoice.");
  if (snapshot.tax.mode === "GST" && snapshot.tax.rateBps > 0) lines.push(`Prices ${snapshot.tax.inclusive ? "include" : "exclude"} GST. Tax is not payable on reverse charge.`);
  lines.push("This is a computer-generated document and needs no signature.");
  return lines;
}

/** Render a tax document PDF from its snapshot. Pure apart from reading the brand fonts. */
export async function renderDocumentPdf(snapshot: DocumentSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const { regular: regularBytes, bold: boldBytes } = await loadFonts();
  const pen: Pen = { page: pdf.addPage(A4), regular: await pdf.embedFont(regularBytes, { subset: true }), bold: await pdf.embedFont(boldBytes, { subset: true }) };
  pdf.setTitle(`${DOCUMENT_KIND_LABELS[snapshot.kind]} ${snapshot.number}`);
  pdf.setAuthor(snapshot.issuer.legalName ?? snapshot.issuer.name);
  pdf.setProducer("Space Works Organization");
  const right = A4[0] - MARGIN;
  const money = (minor: number) => documentAmount(minor, snapshot.currency, snapshot.locale);
  let y = A4[1] - MARGIN - 10;

  // Issuer, left; document title and number, right.
  text(pen, snapshot.issuer.name, MARGIN, y, { size: 17, bold: true, maxWidth: 300 });
  text(pen, DOCUMENT_KIND_LABELS[snapshot.kind], right, y, { size: 15, bold: true, align: "right" });
  y -= 18;
  const issuerLines = [snapshot.issuer.legalName && snapshot.issuer.legalName !== snapshot.issuer.name ? snapshot.issuer.legalName : null, snapshot.issuer.address, snapshot.issuer.state ? indianStateName(snapshot.issuer.state) ?? snapshot.issuer.state : null, snapshot.issuer.gstin ? `GSTIN ${snapshot.issuer.gstin}` : null, snapshot.issuer.email].filter(Boolean) as string[];
  const meta = [`No. ${snapshot.number}`, `Date ${date(snapshot.issuedAt, snapshot.timeZone)}`, `Financial year ${snapshot.financialYear}`];
  for (let index = 0; index < Math.max(issuerLines.length, meta.length); index += 1) {
    if (issuerLines[index]) text(pen, issuerLines[index], MARGIN, y, { color: MUTED, maxWidth: 300 });
    if (meta[index]) text(pen, meta[index], right, y, { align: "right", color: index === 0 ? INK : MUTED, bold: index === 0 });
    y -= 13;
  }

  // Recipient and place of supply.
  y -= 14;
  text(pen, snapshot.kind === "CREDIT_NOTE" ? "Credited to" : "Billed to", MARGIN, y, { size: 8.5, color: MUTED });
  if (snapshot.placeOfSupply) text(pen, "Place of supply", right, y, { size: 8.5, color: MUTED, align: "right" });
  y -= 14;
  text(pen, snapshot.recipient.name, MARGIN, y, { size: 11.5, bold: true, maxWidth: 320 });
  if (snapshot.placeOfSupply) text(pen, `${indianStateName(snapshot.placeOfSupply) ?? snapshot.placeOfSupply} (${snapshot.placeOfSupply})`, right, y, { align: "right" });
  y -= 13;
  text(pen, [`Member no. ${snapshot.recipient.memberNumber}`, snapshot.recipient.gstin ? `GSTIN ${snapshot.recipient.gstin}` : null].filter(Boolean).join(" · "), MARGIN, y, { color: MUTED });
  if (snapshot.sac && snapshot.tax.mode === "GST") text(pen, `SAC ${snapshot.sac}`, right, y, { align: "right", color: MUTED });

  // Lines.
  y -= 30;
  const taxColumns = columnsFor(snapshot);
  const amountX = right;
  const columnXs = taxColumns.map((_, index) => amountX - 92 * (taxColumns.length - index));
  const taxableX = taxColumns.length ? (columnXs[0] ?? amountX) - 92 : null;
  text(pen, "Description", MARGIN, y, { size: 8.5, color: MUTED });
  if (taxableX) text(pen, "Taxable value", taxableX, y, { size: 8.5, color: MUTED, align: "right" });
  taxColumns.forEach((column, index) => text(pen, column.label, columnXs[index], y, { size: 8.5, color: MUTED, align: "right" }));
  text(pen, "Amount", amountX, y, { size: 8.5, color: MUTED, align: "right" });
  y -= 8;
  pen.page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.6, color: RULE });
  for (const line of snapshot.lines) {
    y -= 16;
    text(pen, line.description, MARGIN, y, { maxWidth: (taxableX ?? amountX - 92) - MARGIN - 70 });
    if (taxableX) text(pen, money(line.taxableMinor), taxableX, y, { align: "right" });
    taxColumns.forEach((column, index) => text(pen, money(line[column.key]), columnXs[index], y, { align: "right" }));
    text(pen, money(line.amountMinor), amountX, y, { align: "right" });
  }
  y -= 10;
  pen.page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.6, color: RULE });
  y -= 18;
  text(pen, snapshot.kind === "CREDIT_NOTE" ? "Total credited" : "Total", MARGIN, y, { bold: true, size: 11 });
  if (taxableX) text(pen, money(snapshot.totals.taxableMinor), taxableX, y, { align: "right", bold: true });
  taxColumns.forEach((column, index) => text(pen, money(snapshot.totals[column.key]), columnXs[index], y, { align: "right", bold: true }));
  text(pen, money(snapshot.totals.amountMinor), amountX, y, { align: "right", bold: true, size: 11 });

  // Payment and membership details.
  y -= 36;
  const details = [
    snapshot.membership ? `Membership: ${snapshot.membership.plan}${snapshot.membership.startsAt ? `, ${date(snapshot.membership.startsAt, snapshot.timeZone)} to ${date(snapshot.membership.endsAt, snapshot.timeZone)}` : ""}` : null,
    `${snapshot.kind === "CREDIT_NOTE" ? "Refunded" : "Paid"}: ${date(snapshot.payment.paidAt, snapshot.timeZone)}${snapshot.payment.method ? ` by ${snapshot.payment.method.replace(/_/g, " ")}` : ""}${snapshot.payment.provider !== "OFFLINE" ? ` via ${snapshot.payment.provider === "RAZORPAY" ? "Razorpay" : "Stripe"}` : ""}`,
    snapshot.payment.reference ? `Reference: ${snapshot.payment.reference}` : null,
  ].filter(Boolean) as string[];
  for (const line of details) {
    text(pen, line, MARGIN, y, { maxWidth: right - MARGIN });
    y -= 14;
  }
  y -= 10;
  for (const line of notes(snapshot)) {
    text(pen, line, MARGIN, y, { size: 8.5, color: MUTED, maxWidth: right - MARGIN });
    y -= 12;
  }
  text(pen, "Issued with Space Works Organization", MARGIN, MARGIN - 10, { size: 7.5, color: MUTED });
  return pdf.save();
}
