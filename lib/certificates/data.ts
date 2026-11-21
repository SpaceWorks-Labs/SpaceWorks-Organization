import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { managedImageUrl, memberPhotoUrl } from "@/lib/cards/imageUrl";
import { missingAncestorIds, unitChain, type CardUnitRow } from "@/lib/cards/units";
import { printableWebsite, type CardBranding, type CardHolder } from "@/lib/cards/types";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { certificateVerifyPath } from "./core";
import { withOwnCertificateArtwork, type CertificateSide } from "./design";
import { readLiveCertificate } from "./draft";
import type { CertificateTextValues } from "./placeholders";

/*
 * Everything a certificate render needs, from the database: the organisation, the design's live version (never
 * its draft), and the member's name, number, plan and unit chain, read now.
 */

const UNIT_SELECT = { id: true, name: true, code: true, level: true, path: true } as const;

export const CERTIFICATE_INCLUDE = {
  design: { select: { id: true, name: true, typeLabel: true, pageSize: true, orientation: true, design: true, draft: true, numberPrefix: true, numberFormat: true, archivedAt: true } },
  member: {
    select: {
      id: true, organisationId: true, name: true, email: true, memberNumber: true, photoUrl: true, anonymisedAt: true, userId: true,
      unit: { select: UNIT_SELECT },
      user: { select: { id: true, profileImageUrl: true } },
      terms: { orderBy: { createdAt: "desc" }, take: 1, select: { plan: { select: { name: true } } } },
      cards: { where: { revokedAt: null }, orderBy: { issuedAt: "desc" }, take: 1, select: { cardNumber: true } },
    },
  },
} satisfies Prisma.CertificateInclude;

export type CertificateRecord = Prisma.CertificateGetPayload<{ include: typeof CERTIFICATE_INCLUDE }>;

export type CertificateOrgContext = {
  organisation: { id: string; name: string; slug: string; logoUrl: string | null; accentColor: string | null; timezone: string; status: string; unitLevels: string[]; website: string | null; contactEmail: string | null; contactPhone: string | null };
  /** Ancestor units loaded so far by `loadCertificateUnits`, by id. */
  units: Map<string, CardUnitRow>;
};

/** The public base URL that certificate QR codes point at. */
function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export const certificateVerifyUrl = (token: string) => `${baseUrl()}${certificateVerifyPath(token)}`;

export async function loadCertificateOrgContext(organisationId: string): Promise<CertificateOrgContext | null> {
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, slug: true, logoUrl: true, accentColor: true, timezone: true, status: true, unitLevels: true, website: true, contactEmail: true, contactPhone: true },
  });
  return organisation ? { organisation, units: new Map() } : null;
}

/** Load the ancestor units of these certificates' members into `ctx`, in one query, so `holderFor` can print the chain. */
export async function loadCertificateUnits(ctx: CertificateOrgContext, certificates: ReadonlyArray<Pick<CertificateRecord, "member">>) {
  const units = certificates.flatMap((certificate) => (certificate.member.unit ? [certificate.member.unit] : []));
  for (const unit of units) ctx.units.set(unit.id, unit);
  const missing = missingAncestorIds(units, ctx.units);
  if (missing.length === 0) return;
  const rows = await prisma.orgUnit.findMany({ where: { organisationId: ctx.organisation.id, id: { in: missing } }, select: UNIT_SELECT });
  for (const row of rows) ctx.units.set(row.id, row);
}

export function certificateBranding(ctx: CertificateOrgContext): CardBranding {
  return { orgAccent: ctx.organisation.accentColor, organisationLogoUrl: managedImageUrl(ctx.organisation.logoUrl, { kind: "organisation", organisationId: ctx.organisation.id, category: "organisation-logos" }), watermarkUrl: null };
}

/** The live design of a certificate's design row, drawn only from this organisation's own artwork. Null until the owner first approves it. */
export function liveSide(ctx: CertificateOrgContext, design: CertificateRecord["design"]): CertificateSide | null {
  if (design.design === null) return null;
  return withOwnCertificateArtwork(readLiveCertificate(design, { organisationName: ctx.organisation.name }).design, ctx.organisation.id);
}

const day = (at: Date, timeZone: string) => formatCalendarDate(localDate(at, timeZone));

/** What a certificate prints about its member and itself, read now. */
export function certificateValues(certificate: Pick<CertificateRecord, "title" | "reason" | "issuedAt" | "certificateNumber" | "member">, ctx: CertificateOrgContext): CertificateTextValues {
  return {
    memberName: certificate.member.name,
    memberNumber: certificate.member.cards[0]?.cardNumber ?? String(certificate.member.memberNumber),
    certificateNumber: certificate.certificateNumber,
    title: certificate.title,
    reason: certificate.reason ?? "",
    date: day(certificate.issuedAt, ctx.organisation.timezone),
  };
}

/** The holder the card engine draws: its QR and barcode carry the certificate's verify link and number. */
export function holderFor(certificate: Pick<CertificateRecord, "certificateNumber" | "verifyToken" | "memberId" | "member">, ctx: CertificateOrgContext): CardHolder {
  return {
    memberId: certificate.memberId,
    verifyToken: certificate.verifyToken,
    verifyUrl: certificateVerifyUrl(certificate.verifyToken),
    displayName: certificate.member.name,
    role: null,
    planName: certificate.member.terms[0]?.plan.name ?? null,
    details: [],
    photoUrl: memberPhotoUrl(certificate.member),
    idNumber: certificate.certificateNumber,
    validUntil: null,
    units: unitChain(certificate.member.unit, ctx.units, ctx.organisation.unitLevels),
    contact: { website: printableWebsite(ctx.organisation.website), email: ctx.organisation.contactEmail, phone: ctx.organisation.contactPhone },
    organisationName: ctx.organisation.name,
  };
}

/** One certificate ready to render, or null when it doesn't exist, its member was erased or its design was never approved. */
export async function loadCertificateForRender(certificateId: string) {
  const certificate = await prisma.certificate.findUnique({ where: { id: certificateId }, include: CERTIFICATE_INCLUDE });
  if (!certificate || certificate.member.anonymisedAt) return null;
  const ctx = await loadCertificateOrgContext(certificate.organisationId);
  if (!ctx) return null;
  await loadCertificateUnits(ctx, [certificate]);
  const side = liveSide(ctx, certificate.design);
  if (!side) return null;
  return { certificate, ctx, input: { side, branding: certificateBranding(ctx), values: certificateValues(certificate, ctx), holder: holderFor(certificate, ctx) } };
}
