"use server";

import crypto from "crypto";
import { Prisma, type OrganisationStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { requireSuperAdmin } from "@/lib/permissions";
import { isReviewDecision, REVIEW_DECISIONS } from "@/lib/organisationLifecycle";
import { applicationSnapshot, notifyOwners, organisationApplicationSchema, releaseHeldSlug } from "@/lib/organisations";
import { enqueueOutbox } from "@/lib/outbox";
import { createStarterRoles, ownerRole } from "@/lib/team/roles";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Owner invites from a platform admin last two weeks: long enough for someone to notice the email. */
const OWNER_INVITE_DAYS = 14;

const reviewSchema = z.object({
  organisationId: z.string().trim().min(1).max(64),
  decision: z.string().refine(isReviewDecision, "Unknown decision"),
  reason: z.string().trim().max(2000).optional().transform((value) => value || null),
});

const limitSchema = z.union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(1_000_000)]).transform((value) => (value === "" ? null : value));
const limitsSchema = z.object({
  organisationId: z.string().trim().min(1).max(64),
  memberLimit: limitSchema,
  managerLimit: limitSchema,
});

const createSchema = organisationApplicationSchema.extend({
  ownerEmail: z.string().trim().toLowerCase().email("Enter the owner's email address").max(320),
});


async function superAdmin() {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return null;
  return session;
}

const TOO_MANY = { ok: false as const, error: "Too many requests. Try again shortly." };

/** Approve, ask for changes, decline, suspend, reactivate or archive an organisation. */
export async function reviewOrganisation(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid decision.", fieldErrors: flattenZodErrors(parsed.error) };
  const { organisationId, reason } = parsed.data;
  const decision = REVIEW_DECISIONS[parsed.data.decision as keyof typeof REVIEW_DECISIONS];
  if (decision.reasonRequired && !reason) return { ok: false, error: "Add a note for the organisation.", fieldErrors: { reason: ["The organisation is told this note"] } };

  const outcome = await prisma.$transaction(async (tx) => {
    // Lock the row: two admins deciding at once, or a resubmission mid-decision, must not interleave.
    const [current] = await tx.$queryRaw<Array<{ status: OrganisationStatus; slug: string }>>`SELECT "status", "slug" FROM "Organisation" WHERE "id" = ${organisationId} FOR UPDATE`;
    if (!current) return { kind: "missing" as const };
    if (!decision.from.includes(current.status)) return { kind: "stale" as const };
    await tx.organisation.update({ where: { id: organisationId }, data: { status: decision.to } });
    await tx.organisationReview.create({ data: { organisationId, action: decision.action, actorUserId: session.user.id, reason } });
    if (decision.notice) await notifyOwners(tx, organisationId, decision.notice, reason);
    await recordAuditEvent({
      action: `ORGANISATION_${decision.action}`,
      actorUserId: session.user.id,
      organisationId,
      targetType: "Organisation",
      targetId: organisationId,
      metadata: { from: current.status, to: decision.to },
      client: tx,
    });
    return { kind: "done" as const, slug: current.slug };
  });
  if (outcome.kind === "missing") return { ok: false, error: "Organisation not found." };
  if (outcome.kind === "stale") return { ok: false, error: "Its status changed while you were looking. Reload and decide again." };
  revalidatePath("/super-admin/orgs");
  revalidatePath(`/super-admin/orgs/${organisationId}`);
  revalidatePath(`/dashboard/${outcome.slug}`, "layout");
  return { ok: true };
}

/** Cap how many members and team managers an organisation may have. Empty means no cap. */
export async function setOrganisationLimits(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = limitsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Limits must be whole numbers of at least 1, or empty.", fieldErrors: flattenZodErrors(parsed.error) };
  const { organisationId, memberLimit, managerLimit } = parsed.data;
  const updated = await prisma.organisation.updateMany({ where: { id: organisationId }, data: { memberLimit, managerLimit } });
  if (updated.count !== 1) return { ok: false, error: "Organisation not found." };
  await recordAuditEvent({
    action: "ORGANISATION_LIMITS_CHANGED",
    actorUserId: session.user.id,
    organisationId,
    targetType: "Organisation",
    targetId: organisationId,
    metadata: { memberLimit, managerLimit },
  });
  revalidatePath(`/super-admin/orgs/${organisationId}`);
  return { ok: true };
}

/**
 * Set up an approved organisation for someone. They become its owner by accepting an invite bound to
 * their email address, so an organisation never has an owner who did not agree to it.
 */
export async function createOrganisationForOwner(input: unknown): Promise<ActionResult<{ organisationId: string }>> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const { ownerEmail, ...application } = parsed.data;

  try {
    const organisationId = await prisma.$transaction(async (tx) => {
      await releaseHeldSlug(tx, application.slug);
      const { slug, ...profile } = application;
      const created = await tx.organisation.create({
        data: { ...profile, slug, status: "ACTIVE", source: "SUPERADMIN" },
        select: { id: true },
      });
      await tx.organisationReview.create({
        data: { organisationId: created.id, action: "CREATED", actorUserId: session.user.id, applicationSnapshot: applicationSnapshot(application) },
      });
      const roles = await createStarterRoles(tx, created.id);
      const expiresAt = new Date(Date.now() + OWNER_INVITE_DAYS * 24 * 60 * 60_000);
      const invite = await tx.teamInvite.create({
        data: { organisationId: created.id, token: crypto.randomBytes(24).toString("base64url"), role: "OWNER", roleId: roles.OWNER.id, email: ownerEmail, createdByUserId: session.user.id, expiresAt },
        select: { id: true, token: true },
      });
      await enqueueOutbox(tx, "owner-invite", { to: ownerEmail, organisationId: created.id, token: invite.token, expiresAt: expiresAt.toISOString() });
      await recordAuditEvent({ action: "ORGANISATION_CREATED", actorUserId: session.user.id, organisationId: created.id, targetType: "Organisation", targetId: created.id, client: tx });
      await recordAuditEvent({ action: "ORGANISATION_INVITE_CREATED", actorUserId: session.user.id, organisationId: created.id, targetType: "TeamInvite", targetId: invite.id, metadata: { role: "OWNER" }, client: tx });
      return created.id;
    });
    revalidatePath("/super-admin/orgs");
    return { ok: true, data: { organisationId } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That web address is taken.", fieldErrors: { slug: ["That web address is taken"] } };
    }
    throw error;
  }
}

/** Send a fresh owner invite when the first expired or went to the wrong inbox. */
export async function resendOwnerInvite(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = z.object({ organisationId: z.string().trim().min(1).max(64), ownerEmail: z.string().trim().toLowerCase().email("Enter the owner's email address").max(320) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const { organisationId, ownerEmail } = parsed.data;
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, _count: { select: { teamMembers: { where: { orgRole: { is: { isOwner: true } } } } } } } });
  if (!organisation) return { ok: false, error: "Organisation not found." };
  if (organisation._count.teamMembers > 0) return { ok: false, error: "This organisation already has an owner. They can invite others from the Team page." };

  const expiresAt = new Date(Date.now() + OWNER_INVITE_DAYS * 24 * 60 * 60_000);
  await prisma.$transaction(async (tx) => {
    // Only one owner invite stays usable.
    await tx.teamInvite.deleteMany({ where: { organisationId, orgRole: { is: { isOwner: true } }, usedAt: null } });
    const owner = await ownerRole(tx, organisationId);
    const invite = await tx.teamInvite.create({
      data: { organisationId, token: crypto.randomBytes(24).toString("base64url"), role: "OWNER", roleId: owner.id, email: ownerEmail, createdByUserId: session.user.id, expiresAt },
      select: { id: true, token: true },
    });
    await enqueueOutbox(tx, "owner-invite", { to: ownerEmail, organisationId, token: invite.token, expiresAt: expiresAt.toISOString() });
    await recordAuditEvent({ action: "ORGANISATION_INVITE_CREATED", actorUserId: session.user.id, organisationId, targetType: "TeamInvite", targetId: invite.id, metadata: { role: "OWNER" }, client: tx });
  });
  revalidatePath(`/super-admin/orgs/${organisationId}`);
  return { ok: true };
}

const visibilitySchema = z.object({ organisationId: z.string().trim().min(1).max(64), visibility: z.enum(["UNLISTED", "PUBLIC"]) });

/** List an organisation in the public directory (anyone can find it and apply) or take it off. */
export async function setOrganisationVisibility(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const org = await prisma.organisation.findUnique({ where: { id: parsed.data.organisationId }, select: { status: true, slug: true } });
  if (!org) return { ok: false, error: "Organisation not found." };
  if (parsed.data.visibility === "PUBLIC" && org.status !== "ACTIVE") return { ok: false, error: "Only an active organisation can be listed publicly." };
  await prisma.organisation.update({ where: { id: parsed.data.organisationId }, data: { visibility: parsed.data.visibility } });
  await recordAuditEvent({ action: "ORGANISATION_VISIBILITY_CHANGED", actorUserId: session.user.id, organisationId: parsed.data.organisationId, targetType: "Organisation", targetId: parsed.data.organisationId, metadata: { visibility: parsed.data.visibility } });
  revalidatePath(`/super-admin/orgs/${parsed.data.organisationId}`);
  revalidatePath("/organisations");
  revalidatePath(`/o/${org.slug}`);
  return { ok: true };
}
