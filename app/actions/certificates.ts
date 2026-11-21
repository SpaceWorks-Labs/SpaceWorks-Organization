"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { enqueueOutbox } from "@/lib/outbox";
import { orgActionAccess } from "@/lib/permissions";
import { memberWhere, teamScope, type TeamScope } from "@/lib/membership/scope";
import { CertificateError, issueCertificate, revokeCertificate } from "@/lib/certificates/issue";
import { resolveTargets } from "@/lib/certificates/targets";
import { REASON_MAX, REVOKE_REASON_MAX, TITLE_MAX } from "@/lib/certificates/pages";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const EMAIL_COOLDOWN_MS = 10 * 60_000;

async function access(slug: unknown) {
  const result = await orgActionAccess(slug, "certificates.issue");
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return { ...result, scope: await teamScope(result.organisation.id, result.membership) };
}

/** The certificate, in this organisation and with its member inside the issuer's reach, or null. */
async function scopedCertificate(scope: TeamScope, certificateId: string) {
  const certificate = await prisma.certificate.findFirst({ where: { id: certificateId, organisationId: scope.organisationId, member: memberWhere(scope) }, select: { id: true, memberId: true, revokedAt: true, emailedAt: true } });
  return certificate && (await prisma.member.count({ where: { AND: [memberWhere(scope), { id: certificate.memberId, anonymisedAt: null }] } })) > 0 ? certificate : null;
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof CertificateError) return { ok: false, error: error.message };
  throw error;
}

const issueSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  designId: id,
  /** Printed as {title}; the design's type label when left empty. */
  title: z.string().trim().max(TITLE_MAX).optional(),
  /** Printed as {reason}: a citation or note, the same on every certificate in this request. */
  reason: z.string().trim().max(REASON_MAX).optional(),
  /** Queue each new certificate as a PDF email to its member. */
  email: z.boolean().optional(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("members"), memberIds: z.array(id).min(1).max(500) }),
    z.object({ kind: z.literal("plan"), planId: id }),
    z.object({ kind: z.literal("group"), groupId: id }),
  ]),
});

export type IssueCertificatesResult = { issued: number; skipped: number; certificateIds: string[] };

/**
 * Issue a certificate of one design to chosen members, every current member of a plan, or a smart group: up to 200
 * a request, every member inside the issuer's unit and grouping reach. A member who already holds a valid
 * certificate of this design with the same title is skipped, so repeating a request never doubles anyone up.
 */
export async function issueCertificates(input: unknown): Promise<ActionResult<IssueCertificatesResult>> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const design = await prisma.certificateDesign.findFirst({ where: { id: parsed.data.designId, organisationId: ctx.organisation.id }, select: { id: true, typeLabel: true, design: true, archivedAt: true } });
  if (!design) return { ok: false, error: "That certificate design no longer exists." };
  if (design.archivedAt) return { ok: false, error: "That certificate design is archived." };
  if (design.design === null) return { ok: false, error: "That certificate design has not been approved yet. Ask the owner to approve it." };
  const targets = await resolveTargets(ctx.scope, parsed.data.target);
  if (!targets.ok) return targets;

  const title = parsed.data.title || design.typeLabel;
  const reason = parsed.data.reason || null;
  const now = new Date();
  const certificateIds: string[] = [];
  let skipped = 0;
  for (const memberId of targets.memberIds) {
    try {
      const certificate = await prisma.$transaction(async (tx) => {
        const issued = await issueCertificate(tx, { organisationId: ctx.organisation.id, designId: design.id, memberId, title, reason, actorUserId: ctx.userId });
        if (issued && parsed.data.email) {
          await tx.certificate.update({ where: { id: issued.id }, data: { emailedAt: now } });
          await enqueueOutbox(tx, "certificate-email", { certificateId: issued.id, organisationId: ctx.organisation.id });
        }
        return issued;
      });
      if (certificate) certificateIds.push(certificate.id);
      else skipped += 1;
    } catch (error) {
      // A number pattern with none free ends the request; a member erased meanwhile is skipped.
      if (error instanceof CertificateError && error.message === "Member not found.") skipped += 1;
      else return failure(error);
    }
  }
  revalidatePath(`/dashboard/${ctx.organisation.slug}/certificates`);
  return { ok: true, data: { issued: certificateIds.length, skipped, certificateIds } };
}

const revokeSchema = z.object({ organisationSlug: z.string().trim().min(1), certificateId: id, reason: z.string().trim().min(1, "Say why it is being revoked.").max(REVOKE_REASON_MAX, `Keep the reason to ${REVOKE_REASON_MAX} characters.`) });

/** Revoke a valid certificate. It stays on record; its check page then shows it as revoked and no longer names the member. */
export async function revokeIssuedCertificate(input: unknown): Promise<ActionResult> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const certificate = await scopedCertificate(ctx.scope, parsed.data.certificateId);
  if (!certificate) return { ok: false, error: "Certificate not found." };
  try {
    await prisma.$transaction((tx) => revokeCertificate(tx, { organisationId: ctx.organisation.id, certificateId: certificate.id, actorUserId: ctx.userId, reason: parsed.data.reason }));
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/dashboard/${ctx.organisation.slug}/certificates`);
  revalidatePath(`/dashboard/${ctx.organisation.slug}/certificates/${certificate.id}`);
  return { ok: true };
}

const certificateSchema = z.object({ organisationSlug: z.string().trim().min(1), certificateId: id });

/** Queue the certificate as a PDF email to the member. One per certificate every ten minutes. */
export async function emailIssuedCertificate(input: unknown): Promise<ActionResult> {
  const parsed = certificateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const certificate = await scopedCertificate(ctx.scope, parsed.data.certificateId);
  if (!certificate || certificate.revokedAt) return { ok: false, error: "Certificate not found." };
  const now = new Date();
  const queued = await prisma.$transaction(async (tx) => {
    const { count } = await tx.certificate.updateMany({
      where: { id: certificate.id, organisationId: ctx.organisation.id, OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }] },
      data: { emailedAt: now },
    });
    if (count === 0) return false;
    await enqueueOutbox(tx, "certificate-email", { certificateId: certificate.id, organisationId: ctx.organisation.id });
    await recordAuditEvent({ action: "CERTIFICATE_EMAILED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Certificate", targetId: certificate.id, client: tx });
    return true;
  });
  if (!queued) return { ok: false, error: "This certificate was emailed a few minutes ago. Try again later." };
  revalidatePath(`/dashboard/${ctx.organisation.slug}/certificates/${certificate.id}`);
  return { ok: true };
}

const searchSchema = z.object({ organisationSlug: z.string().trim().min(1), query: z.string().max(200) });

export type CertificateRecipientOption = { id: string; name: string; unitName: string | null };

/** Members whose name contains the query, inside the issuer's reach, at most 20, to choose recipients from. */
export async function searchCertificateRecipients(input: unknown): Promise<ActionResult<{ members: CertificateRecipientOption[] }>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const rows = await prisma.member.findMany({
    where: { AND: [memberWhere(ctx.scope), { anonymisedAt: null, name: { contains: parsed.data.query.trim(), mode: "insensitive" } }] },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, unit: { select: { name: true } } },
  });
  return { ok: true, data: { members: rows.map((row) => ({ id: row.id, name: row.name, unitName: row.unit?.name ?? null })) } };
}
