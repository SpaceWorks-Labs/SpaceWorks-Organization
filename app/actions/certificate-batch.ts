"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { enqueueOutbox } from "@/lib/outbox";
import { orgActionAccess } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { ISSUE_LIMIT } from "@/lib/certificates/core";
import { TITLE_MAX } from "@/lib/certificates/pages";
import { resolveTargets } from "@/lib/certificates/targets";
import type { ActionResult } from "./org";

/*
 * The issue page's helpers around `issueCertificates` (app/actions/certificates.ts): a dry run that says how many
 * members a choice reaches and who would be skipped, and emailing a batch just issued. Both need
 * `certificates.issue` and only ever touch members inside the issuer's unit and grouping reach.
 */

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const EMAIL_COOLDOWN_MS = 10 * 60_000;
const SKIPPED_SHOWN = 20;

async function access(slug: unknown) {
  const result = await orgActionAccess(slug, "certificates.issue");
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return { ...result, scope: await teamScope(result.organisation.id, result.membership) };
}

const previewSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  designId: id,
  title: z.string().trim().max(TITLE_MAX).optional(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("members"), memberIds: z.array(id).min(1).max(500) }),
    z.object({ kind: z.literal("plan"), planId: id }),
    z.object({ kind: z.literal("group"), groupId: id }),
  ]),
});

export type CertificateIssuePreview = { recipients: number; willIssue: number; skipped: number; skippedNames: string[] };

/**
 * What issuing would do, without issuing: how many members the choice reaches, and who already holds a valid
 * certificate of this design with this title (they are skipped). The same refusals as issuing (over 200 members,
 * nobody, a plan or group that is gone) come back as errors.
 */
export async function previewCertificateIssue(input: unknown): Promise<ActionResult<CertificateIssuePreview>> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const design = await prisma.certificateDesign.findFirst({ where: { id: parsed.data.designId, organisationId: ctx.organisation.id }, select: { id: true, typeLabel: true } });
  if (!design) return { ok: false, error: "That certificate design no longer exists." };
  const targets = await resolveTargets(ctx.scope, parsed.data.target);
  if (!targets.ok) return targets;
  const title = parsed.data.title || design.typeLabel;
  const holders = await prisma.certificate.findMany({
    where: { organisationId: ctx.organisation.id, designId: design.id, title, revokedAt: null, memberId: { in: targets.memberIds } },
    select: { memberId: true, member: { select: { name: true } } },
    orderBy: { member: { name: "asc" } },
  });
  const skipped = new Map(holders.map((row) => [row.memberId, row.member.name]));
  return {
    ok: true,
    data: { recipients: targets.memberIds.length, willIssue: targets.memberIds.length - skipped.size, skipped: skipped.size, skippedNames: [...skipped.values()].slice(0, SKIPPED_SHOWN) },
  };
}

const emailSchema = z.object({ organisationSlug: z.string().trim().min(1), certificateIds: z.array(id).min(1).max(ISSUE_LIMIT) });

export type CertificateBatchEmail = { queued: number; skipped: number };

/**
 * Queue each valid certificate of the batch as a PDF email to its member, once: one emailed in the last ten
 * minutes, revoked, erased or outside the issuer's reach is skipped.
 */
export async function emailIssuedCertificates(input: unknown): Promise<ActionResult<CertificateBatchEmail>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const ids = [...new Set(parsed.data.certificateIds)];
  const now = new Date();
  const due = await prisma.certificate.findMany({
    where: {
      id: { in: ids }, organisationId: ctx.organisation.id, revokedAt: null,
      OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }],
      member: { AND: [memberWhere(ctx.scope), { anonymisedAt: null }] },
    },
    select: { id: true },
  });
  let queued = 0;
  for (const certificate of due) {
    const sent = await prisma.$transaction(async (tx) => {
      const { count } = await tx.certificate.updateMany({
        where: { id: certificate.id, organisationId: ctx.organisation.id, OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }] },
        data: { emailedAt: now },
      });
      if (count === 0) return false;
      await enqueueOutbox(tx, "certificate-email", { certificateId: certificate.id, organisationId: ctx.organisation.id });
      await recordAuditEvent({ action: "CERTIFICATE_EMAILED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Certificate", targetId: certificate.id, client: tx });
      return true;
    });
    if (sent) queued += 1;
  }
  revalidatePath(`/dashboard/${ctx.organisation.slug}/certificates`);
  return { ok: true, data: { queued, skipped: ids.length - queued } };
}
