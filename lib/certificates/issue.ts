import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type Certificate } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { formatCardNumberFrom, formatUsesUnits, formatUsesYear, yearIn, type NumberParts } from "@/lib/cards/numbering";
import { pathIds } from "@/lib/cards/units";
import { certificateCounterName } from "./core";
import { DEFAULT_CERTIFICATE_NUMBER_FORMAT, certificatePrefix } from "./design";

/*
 * Issuing and revoking certificates. Every change locks the member row first, so two issues for one member
 * queue; numbers come from the design's own series (`OrgCounter` `certificate:<design>`), numbered under one
 * advisory lock per organisation so concurrent issues never meet in the unique index. A certificate is never
 * deleted: revoking keeps the row and the verify page shows it as revoked.
 */

type Tx = Prisma.TransactionClient;

export class CertificateError extends Error {
  override name = "CertificateError";
}

/** 32 random bytes as base64url: 43 characters. */
export const newCertificateToken = () => randomBytes(32).toString("base64url");

async function lockMember(tx: Tx, organisationId: string, memberId: string) {
  const rows = await tx.$queryRaw<Array<{ memberNumber: number; anonymisedAt: Date | null }>>`
    SELECT "memberNumber", "anonymisedAt" FROM "Member" WHERE "id" = ${memberId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  const member = rows[0];
  if (!member || member.anonymisedAt) throw new CertificateError("Member not found.");
  return member;
}

async function bumpCounter(tx: Tx, organisationId: string, name: string) {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "OrgCounter" ("organisationId", "name", "next") VALUES (${organisationId}, ${name}, 2)
    ON CONFLICT ("organisationId", "name") DO UPDATE SET "next" = "OrgCounter"."next" + 1
    RETURNING "next" - 1 AS value`;
  return Number(row!.value);
}

/** The member's unit codes as they are now, for a pattern with {UNIT} or {U1}…{U4}. The number keeps them. */
async function unitCodesNow(tx: Tx, organisationId: string, memberId: string): Promise<Pick<NumberParts, "unitCode" | "unitCodes">> {
  const member = await tx.member.findFirst({ where: { id: memberId, organisationId }, select: { unit: { select: { code: true, path: true } } } });
  if (!member?.unit) return {};
  const chain = await tx.orgUnit.findMany({ where: { organisationId, id: { in: pathIds(member.unit.path) } }, select: { code: true, level: true } });
  const unitCodes: string[] = [];
  for (const unit of chain) unitCodes[unit.level] = unit.code;
  return { unitCode: member.unit.code, unitCodes };
}

type DesignNumbering = { id: string; name: string; numberPrefix: string; numberFormat: string };

/** The next free certificate number in the design's series. A number some certificate already has is skipped. */
async function nextCertificateNumber(tx: Tx, organisationId: string, design: DesignNumbering, memberId: string, memberNumber: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`certificate-number:${organisationId}`}))`;
  const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timezone: true } });
  const format = design.numberFormat || DEFAULT_CERTIFICATE_NUMBER_FORMAT;
  const prefix = design.numberPrefix || certificatePrefix(design.name);
  const year = yearIn(org.timezone);
  const counter = certificateCounterName(design.id, formatUsesYear(format) ? year : null);
  const units = formatUsesUnits(format) ? await unitCodesNow(tx, organisationId, memberId) : {};
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const number = formatCardNumberFrom(format, { prefix, seq: await bumpCounter(tx, organisationId, counter), memberNumber, year, ...units });
    if (!(await tx.certificate.findFirst({ where: { organisationId, certificateNumber: number }, select: { id: true } }))) return number;
  }
  throw new CertificateError("No free certificate number is left in this pattern. Change the number pattern or its prefix.");
}

export type IssueArgs = { organisationId: string; designId: string; memberId: string; title: string; reason: string | null; actorUserId: string; skipExisting?: boolean };

/**
 * Issue one certificate. Returns null when the member already holds a valid certificate of this design with the
 * same title (`skipExisting`, the default), so repeating a bulk issue never doubles anyone up. Throws
 * `CertificateError` for a design that is archived or was never approved, and for an erased member.
 */
export async function issueCertificate(tx: Tx, args: IssueArgs): Promise<Certificate | null> {
  const member = await lockMember(tx, args.organisationId, args.memberId);
  const design = await tx.certificateDesign.findFirst({ where: { id: args.designId, organisationId: args.organisationId }, select: { id: true, name: true, numberPrefix: true, numberFormat: true, design: true, archivedAt: true } });
  if (!design) throw new CertificateError("That certificate design no longer exists.");
  if (design.archivedAt) throw new CertificateError("That certificate design is archived.");
  if (design.design === null) throw new CertificateError("That certificate design has not been approved yet.");
  if (args.skipExisting !== false) {
    const existing = await tx.certificate.findFirst({ where: { organisationId: args.organisationId, designId: design.id, memberId: args.memberId, title: args.title, revokedAt: null }, select: { id: true } });
    if (existing) return null;
  }
  const certificateNumber = await nextCertificateNumber(tx, args.organisationId, design, args.memberId, member.memberNumber);
  const certificate = await tx.certificate.create({
    data: { organisationId: args.organisationId, designId: design.id, memberId: args.memberId, certificateNumber, verifyToken: newCertificateToken(), title: args.title, reason: args.reason, issuedById: args.actorUserId },
  });
  await recordAuditEvent({ action: "CERTIFICATE_ISSUED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "Certificate", targetId: certificate.id, metadata: { designId: design.id }, client: tx });
  return certificate;
}

/** Revoke a valid certificate, with the reason the verify page's owner sees on record. */
export async function revokeCertificate(tx: Tx, args: { organisationId: string; certificateId: string; actorUserId: string; reason: string }) {
  const certificate = await tx.certificate.findFirst({ where: { id: args.certificateId, organisationId: args.organisationId } });
  if (!certificate) throw new CertificateError("Certificate not found.");
  await tx.$queryRaw`SELECT "id" FROM "Member" WHERE "id" = ${certificate.memberId} AND "organisationId" = ${args.organisationId} FOR UPDATE`;
  const { count } = await tx.certificate.updateMany({ where: { id: certificate.id, organisationId: args.organisationId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: args.actorUserId, revokedReason: args.reason } });
  if (count === 0) throw new CertificateError("This certificate was already revoked.");
  await recordAuditEvent({ action: "CERTIFICATE_REVOKED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "Certificate", targetId: certificate.id, client: tx });
  return certificate;
}
