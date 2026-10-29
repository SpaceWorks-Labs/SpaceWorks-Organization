"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isOrganisationApplicationsEnabled } from "@/lib/instanceSettings";
import { can, getMembership, hasAuthenticator, isUserEmailVerified, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { canResubmit } from "@/lib/organisationLifecycle";
import { createStarterRoles, roleColumns } from "@/lib/team/roles";
import {
  alertPlatformAdmins,
  applicationSnapshot,
  isSlugReleasable,
  notifyOwners,
  organisationApplicationSchema,
  organisationProfileSchema,
  releaseHeldSlug,
  type OrganisationProfile,
} from "@/lib/organisations";
import { organisationSlugSchema } from "@/lib/validators";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Open applications one person may have at a time; stops one account flooding the review queue. */
const MAX_OPEN_APPLICATIONS = 3;

function profileColumns(profile: OrganisationProfile) {
  return {
    name: profile.name,
    kind: profile.kind,
    description: profile.description,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    website: profile.website,
    addressLine: profile.addressLine,
    city: profile.city,
    stateCode: profile.stateCode,
    postalCode: profile.postalCode,
  };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Whether a web address is free, for the live hint on the application form. */
export async function checkOrganisationSlug(input: unknown): Promise<ActionResult<{ available: boolean; reason?: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many checks. Try again shortly." };
  const parsed = organisationSlugSchema.safeParse(input);
  if (!parsed.success) return { ok: true, data: { available: false, reason: parsed.error.issues[0]?.message } };
  const holder = await prisma.organisation.findUnique({ where: { slug: parsed.data }, select: { status: true, updatedAt: true } });
  if (!holder || isSlugReleasable(holder)) return { ok: true, data: { available: true } };
  return { ok: true, data: { available: false, reason: "That web address is taken" } };
}

/**
 * Apply for a new organisation. The applicant becomes its owner; nothing opens until a platform admin
 * approves it. Owners and platform admins are emailed through the outbox in the same transaction.
 */
export async function submitOrganisationApplication(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!(await isOrganisationApplicationsEnabled())) return { ok: false, error: "This platform isn't taking new applications right now." };
  if (!(await isUserEmailVerified(userId))) return { ok: false, error: "Verify your email address before applying, so we can reach you about the decision." };

  const parsed = organisationApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const application = parsed.data;

  const open = await prisma.teamMember.count({
    where: { userId, orgRole: { is: { isOwner: true } }, organisation: { status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] } } },
  });
  if (open >= MAX_OPEN_APPLICATIONS) return { ok: false, error: "You already have applications waiting for a decision. Wait for those first." };
  // Counted only once the form is valid, so fixing typos never uses up the allowance.
  if (await isActionRateLimited("application", userId)) return { ok: false, error: "Too many applications today. Try again tomorrow." };

  try {
    const organisation = await prisma.$transaction(async (tx) => {
      await releaseHeldSlug(tx, application.slug);
      const created = await tx.organisation.create({
        data: { ...profileColumns(application), slug: application.slug, status: "PENDING_REVIEW", source: "SELF_SIGNUP" },
        select: { id: true, slug: true },
      });
      const roles = await createStarterRoles(tx, created.id);
      await tx.teamMember.create({ data: { userId, organisationId: created.id, ...roleColumns(roles.OWNER) } });
      await tx.organisationReview.create({
        data: { organisationId: created.id, action: "SUBMITTED", actorUserId: userId, applicationSnapshot: applicationSnapshot(application) },
      });
      await notifyOwners(tx, created.id, "received");
      await alertPlatformAdmins(tx, created.id);
      await recordAuditEvent({ action: "ORGANISATION_APPLIED", actorUserId: userId, organisationId: created.id, targetType: "Organisation", targetId: created.id, client: tx });
      return created;
    });
    revalidatePath("/dashboard");
    revalidatePath("/super-admin/orgs");
    return { ok: true, data: { slug: organisation.slug } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That web address is taken.", fieldErrors: { slug: ["That web address is taken"] } };
    throw error;
  }
}

/** Send an application back for review after a platform admin asked for changes. */
export async function resubmitOrganisationApplication(input: unknown): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const slug = typeof input === "object" && input !== null ? (input as { organisationSlug?: unknown }).organisationSlug : undefined;
  if (typeof slug !== "string") return { ok: false, error: "Organisation not found." };

  const parsed = organisationProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  if (await isActionRateLimited("action", userId)) return { ok: false, error: "Too many requests. Try again shortly." };

  const organisation = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!organisation) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(userId, organisation.id);
  if (!membership) return { ok: false, error: "Organisation not found." };
  if (!can(membership, "org.settings", { write: true })) return { ok: false, error: "Only owners and managers can update the application." };
  if (!(await hasAuthenticator(userId))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };

  const outcome = await prisma.$transaction(async (tx) => {
    // Lock the row so a platform admin's decision and this resubmission can't cross.
    const [current] = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "Organisation" WHERE "id" = ${organisation.id} FOR UPDATE`;
    if (!current || !canResubmit(current.status as Parameters<typeof canResubmit>[0])) return "not-editable" as const;
    await tx.organisation.update({ where: { id: organisation.id }, data: { ...profileColumns(parsed.data), status: "PENDING_REVIEW" } });
    await tx.organisationReview.create({
      data: { organisationId: organisation.id, action: "RESUBMITTED", actorUserId: userId, applicationSnapshot: applicationSnapshot({ ...parsed.data, slug: organisation.slug }) },
    });
    await alertPlatformAdmins(tx, organisation.id, true);
    await recordAuditEvent({ action: "ORGANISATION_RESUBMITTED", actorUserId: userId, organisationId: organisation.id, targetType: "Organisation", targetId: organisation.id, client: tx });
    return "resubmitted" as const;
  });
  if (outcome === "not-editable") return { ok: false, error: "This application can't be changed now. Reload to see its current status." };
  revalidatePath(`/dashboard/${organisation.slug}/application`);
  revalidatePath("/super-admin/orgs");
  return { ok: true };
}
