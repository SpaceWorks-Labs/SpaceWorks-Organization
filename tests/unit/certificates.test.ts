import { describe, expect, it } from "vitest";
import { CAPABILITY_LIST, STARTER_ROLES, can, type StaffActor } from "@/lib/permissionRoles";
import { buildCardScene } from "@/lib/cards/layout";
import { loadCardFonts } from "@/lib/cards/fonts";
import { formatCardNumberFrom } from "@/lib/cards/numbering";
import { EMPTY_BRANDING } from "@/lib/cards/types";
import { certificateCounterName, certificateFileBase, certificateState, certificateVerifyPath } from "@/lib/certificates/core";
import { certificateFonts, certificateNumberFormatError, defaultCertificateSide, normalizeCertificateSide, withOwnCertificateArtwork } from "@/lib/certificates/design";
import { certificateDraftDiffers, readCertificateDraft, readLiveCertificate, type CertificateRow } from "@/lib/certificates/draft";
import { pageDimensions, readPage } from "@/lib/certificates/pages";
import { fillCertificateText, withCertificateText } from "@/lib/certificates/placeholders";
import { sampleCertificate } from "@/lib/certificates/sample";
import { certificateVerificationView } from "@/lib/certificates/verify";
import { comparePdfToPng } from "../helpers/cardParity";

const context = { organisationName: "Example Network" };
const A4_LANDSCAPE = { pageSize: "A4", orientation: "LANDSCAPE" } as const;
const values = { memberName: "Asha Menon", memberNumber: "M-0042", certificateNumber: "CA-0007", title: "Certificate of appreciation", reason: "For service.", date: "21 Nov 2026" };

describe("pages", () => {
  it("are A4 or Letter, landscape or portrait, in millimetres", () => {
    expect(pageDimensions("A4", "LANDSCAPE")).toEqual({ widthMm: 297, heightMm: 210 });
    expect(pageDimensions("A4", "PORTRAIT")).toEqual({ widthMm: 210, heightMm: 297 });
    expect(pageDimensions("LETTER", "LANDSCAPE")).toEqual({ widthMm: 279.4, heightMm: 215.9 });
    expect(pageDimensions("LETTER", "PORTRAIT")).toEqual({ widthMm: 215.9, heightMm: 279.4 });
  });
  it("read as A4 landscape when anything unexpected is stored", () => {
    expect(readPage({ pageSize: "A0", orientation: 3 })).toEqual(A4_LANDSCAPE);
  });
});

describe("a design at certificate size", () => {
  it("is one side at the page's size with no built-in card items", () => {
    const side = normalizeCertificateSide({ widthMm: 85.6, heightMm: 54, showQr: true, showName: true, heading: "Hi", watermark: { kind: "text", text: "X" }, showPhoto: true }, context, A4_LANDSCAPE);
    expect([side.widthMm, side.heightMm]).toEqual([297, 210]);
    expect([side.showQr, side.showName, side.showPhoto, side.showLogo, side.showSymbol, side.showFooter, side.showCardLabel]).toEqual([false, false, false, false, false, false, false]);
    expect(side.heading).toBe("");
    expect(side.watermark.kind).toBe("none");
  });
  it("keeps layers inside a portrait Letter page and drops unsafe ones", () => {
    const side = normalizeCertificateSide({ layers: [
      { id: "ltext1", kind: "text", text: "Hello", xMm: 500, yMm: 900, wMm: 50, hMm: 10 },
      { id: "limg1", kind: "image", url: "https://example.test/x.png", xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
      { id: "bad id", kind: "text" },
    ] }, context, { pageSize: "LETTER", orientation: "PORTRAIT" });
    expect([side.widthMm, side.heightMm]).toEqual([215.9, 279.4]);
    expect(side.layers.map((layer) => layer.id)).toEqual(["ltext1"]);
    expect(side.layers[0]!.xMm).toBeLessThanOrEqual(214.9);
    expect(side.layers[0]!.yMm).toBeLessThanOrEqual(279.3);
  });
  it("starts with a full starter layout on every page", () => {
    for (const page of [A4_LANDSCAPE, { pageSize: "A4", orientation: "PORTRAIT" }, { pageSize: "LETTER", orientation: "LANDSCAPE" }] as const) {
      const side = defaultCertificateSide(context, page);
      expect(side.layers.length).toBe(13);
      expect(side.layers.some((layer) => layer.kind === "qr")).toBe(true);
      for (const layer of side.layers) expect(layer.xMm + layer.wMm).toBeLessThanOrEqual(side.widthMm + 0.5);
    }
  });
  it("draws only the organisation's own artwork", () => {
    const own = "/api/uploads/organisations/org1/member-id-artwork/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e.webp";
    const other = "/api/uploads/organisations/org2/member-id-artwork/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e.webp";
    const side = normalizeCertificateSide({ background: { imageUrl: other }, layers: [{ id: "limg1", kind: "image", url: own, wMm: 20, hMm: 20 }, { id: "limg2", kind: "image", url: other, wMm: 20, hMm: 20 }] }, context, A4_LANDSCAPE);
    const scoped = withOwnCertificateArtwork(side, "org1");
    expect(scoped.layers.map((layer) => layer.id)).toEqual(["limg1"]);
    expect(scoped.background.imageUrl).toBeNull();
  });
  it("lists the fonts its text layers use", () => {
    const side = normalizeCertificateSide({ layers: [{ id: "ltext1", kind: "text", text: "x", font: "playfair-display" }] }, context, A4_LANDSCAPE);
    expect(certificateFonts(side)).toEqual(["playfair-display"]);
  });
});

describe("placeholders", () => {
  it("fill the certificate's words and leave others as typed", () => {
    expect(fillCertificateText("{member.name} · {member.number} · {certificate.number} · {title} · {reason} · {date} · {nope}", values))
      .toBe("Asha Menon · M-0042 · CA-0007 · Certificate of appreciation · For service. · 21 Nov 2026 · {nope}");
  });
  it("never read a filled value as a placeholder again", () => {
    const filled = fillCertificateText("{reason}", { ...values, reason: "Thanks {member.name}" });
    expect(filled).toBe("Thanks {​member.name}");
    expect(fillCertificateText(filled, values)).toBe(filled);
  });
  it("reach text layers only", () => {
    const side = normalizeCertificateSide({ layers: [{ id: "ltext1", kind: "text", text: "{member.name}" }, { id: "lrect1", kind: "rect", name: "{member.name}" }] }, context, A4_LANDSCAPE);
    const filled = withCertificateText(side, values);
    expect(filled.layers[0]).toMatchObject({ text: "Asha Menon" });
    expect(filled.layers[1]).toMatchObject({ name: "{member.name}" });
  });
  it("resolve in a drawn scene, with the card placeholders alongside", async () => {
    const side = normalizeCertificateSide({ layers: [{ id: "ltext1", kind: "text", text: "{member.name} of {organisation} / {unit} / {title}", wMm: 200, hMm: 10 }] }, context, A4_LANDSCAPE);
    const { holder } = sampleCertificate({ organisationName: "Example Network", unitLevels: ["Area", "Unit"], title: "T" });
    const { measurer } = await loadCardFonts();
    const scene = buildCardScene({ settings: withCertificateText(side, values), holder, branding: EMPTY_BRANDING, measurer });
    const text = JSON.stringify(scene.ops);
    expect(text).toContain("Asha");
    expect(text).toContain("Example");
    expect(text).toContain("North 1");
    expect(text).toContain("Certificate");
    expect(text).not.toContain("{member.name}");
  });
});

describe("numbering", () => {
  it("runs one series per design, restarting each year when the pattern has a year", () => {
    expect(certificateCounterName("d1", null)).toBe("certificate:d1");
    expect(certificateCounterName("d1", 2026)).toBe("certificate:d1:2026");
    expect(certificateCounterName("d1", null)).not.toBe(certificateCounterName("d2", null));
  });
  it("uses the card pattern tokens, said for certificates", () => {
    expect(formatCardNumberFrom("{PREFIX}-{YYYY}-{SEQ:4}", { prefix: "CA", seq: 7, memberNumber: 3, year: 2026 })).toBe("CA-2026-0007");
    expect(certificateNumberFormatError("{PREFIX}")).toBeTruthy();
    expect(certificateNumberFormatError("{SEQ:8}-{PREFIX}-{PREFIX}-{UNIT}-ABCDE")).toMatch(/Certificate numbers can be up to 32/);
    expect(certificateNumberFormatError("{PREFIX}-{SEQ:4}")).toBeNull();
  });
  it("makes safe file names", () => {
    expect(certificateFileBase("CA/0007", "Asha Menon")).toBe("CA-0007-asha-menon");
  });
  it("puts the check page at its own path", () => {
    expect(certificateVerifyPath("abc")).toBe("/verify/certificate/abc");
  });
});

describe("drafts", () => {
  const live = defaultCertificateSide(context, A4_LANDSCAPE);
  const draftSide = { ...live, layers: live.layers.slice(0, 3) };
  const row: CertificateRow = { design: live, draft: { design: draftSide, numberPrefix: "ZZ", numberFormat: "{PREFIX}-{SEQ:3}", pageSize: "A4", orientation: "PORTRAIT", typeLabel: "Draft title" }, pageSize: "A4", orientation: "LANDSCAPE", numberPrefix: "CA", numberFormat: "{PREFIX}-{SEQ:4}", typeLabel: "Live title" };

  it("are what the designer edits, and never what issued certificates draw", () => {
    const draft = readCertificateDraft(row, context);
    expect([draft.design.layers.length, draft.orientation, draft.numberPrefix, draft.typeLabel]).toEqual([3, "PORTRAIT", "ZZ", "Draft title"]);
    const issued = readLiveCertificate(row, context);
    expect([issued.design.layers.length, issued.orientation, issued.numberPrefix, issued.typeLabel, issued.design.widthMm]).toEqual([13, "LANDSCAPE", "CA", "Live title", 297]);
  });
  it("differ only when they would change something", () => {
    expect(certificateDraftDiffers(row, context)).toBe(true);
    expect(certificateDraftDiffers({ ...row, draft: null }, context)).toBe(false);
    expect(certificateDraftDiffers({ ...row, draft: { design: live } }, context)).toBe(false);
  });
  it("fall back to the live numbering when the draft's is invalid", () => {
    const draft = readCertificateDraft({ ...row, draft: { design: live, numberPrefix: "bad prefix", numberFormat: "no sequence" } }, context);
    expect([draft.numberPrefix, draft.numberFormat]).toEqual(["CA", "{PREFIX}-{SEQ:4}"]);
  });
});

describe("the public check", () => {
  const record = { certificate: { title: "Appreciation", certificateNumber: "CA-0007", issuedAt: new Date("2026-11-21T10:00:00Z"), revokedAt: null as Date | null }, member: { name: "Asha Menon", anonymisedAt: null as Date | null }, organisation: { name: "Example Network", slug: "example", status: "ACTIVE", timezone: "Asia/Kolkata", logoUrl: null } };
  it("shows a valid certificate with its holder", () => {
    expect(certificateVerificationView(record)).toMatchObject({ state: "certificate", verdict: "valid", memberName: "Asha Menon", title: "Appreciation", issuedOn: "21 Nov 2026" });
  });
  it("shows a revoked one without naming the holder", () => {
    expect(certificateVerificationView({ ...record, certificate: { ...record.certificate, revokedAt: new Date() } })).toMatchObject({ verdict: "revoked", memberName: null });
  });
  it("never confirms an unknown token, an erased member or an organisation that is not running", () => {
    expect(certificateVerificationView(null)).toEqual({ state: "not-found" });
    expect(certificateVerificationView({ ...record, member: { ...record.member, anonymisedAt: new Date() } })).toEqual({ state: "not-found" });
    expect(certificateVerificationView({ ...record, organisation: { ...record.organisation, status: "PENDING" } })).toEqual({ state: "not-found" });
    expect(certificateVerificationView({ ...record, organisation: { ...record.organisation, status: "SUSPENDED" } })).toEqual({ state: "suspended", organisationName: "Example Network" });
  });
  it("names the two states", () => {
    expect(certificateState({ revokedAt: null })).toBe("valid");
    expect(certificateState({ revokedAt: new Date() })).toBe("revoked");
  });
});

describe("permissions", () => {
  const starter = (key: string) => STARTER_ROLES.find((role) => role.key === key)!;
  const actor = (key: string, unitId: string | null = null): StaffActor => ({ orgRole: starter(key), unitId });
  it("list the three certificate permissions", () => {
    for (const capability of ["certificates.issue", "certificates.design", "certificates.approve"]) expect(CAPABILITY_LIST).toContain(capability);
  });
  it("give issuing and designing to Owner and Manager like cards, and approving to the Owner alone", () => {
    for (const key of ["OWNER", "ADMIN"]) {
      expect(can(actor(key), "certificates.issue")).toBe(true);
      expect(can(actor(key), "certificates.design", { write: true })).toBe(true);
    }
    for (const key of ["TREASURER", "VIEWER"]) {
      expect(can(actor(key), "certificates.issue")).toBe(false);
      expect(can(actor(key), "certificates.design")).toBe(false);
    }
    expect(can(actor("OWNER"), "certificates.approve")).toBe(true);
    expect(can(actor("ADMIN"), "certificates.approve")).toBe(false);
  });
  it("let a manager limited to a unit issue, but only read designs", () => {
    expect(can(actor("ADMIN", "unit"), "certificates.issue", { write: true })).toBe(true);
    expect(can(actor("ADMIN", "unit"), "certificates.design")).toBe(true);
    expect(can(actor("ADMIN", "unit"), "certificates.design", { write: true })).toBe(false);
  });
});

describe("PDF and PNG are the same certificate", () => {
  it.each([["A4 landscape", A4_LANDSCAPE], ["Letter portrait", { pageSize: "LETTER", orientation: "PORTRAIT" } as const]])("%s", async (_label, page) => {
    const side = defaultCertificateSide(context, page);
    const { holder, values: sampleValues } = sampleCertificate({ organisationName: "Example Network", unitLevels: ["Area", "Unit"], title: "Certificate of appreciation" });
    const { measurer } = await loadCardFonts(certificateFonts(side));
    const scene = buildCardScene({ settings: withCertificateText(side, sampleValues), holder, branding: EMPTY_BRANDING, measurer });
    expect([scene.widthMm, scene.heightMm]).toEqual([side.widthMm, side.heightMm]);
    const result = await comparePdfToPng(scene);
    expect(result.meanDifference).toBeLessThan(3.2);
    expect(result.offShare).toBeLessThan(0.003);
  }, 120_000);
});
