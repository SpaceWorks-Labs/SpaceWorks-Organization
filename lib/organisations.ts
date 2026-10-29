import "server-only";

import { OrganisationStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { isIndianStateCode } from "@/lib/indianStates";
import { organisationSlugSchema } from "@/lib/validators";
import { enqueueOutbox, type OutboxClient } from "@/lib/outbox";
import type { OrganisationNotice } from "@/lib/organisationLifecycle";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

/** What an organisation tells the platform when it applies (or what a platform admin enters). */
export const organisationProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your organisation's name").max(120),
  kind: z.string().trim().min(2, "Say what kind of organisation it is").max(60),
  description: z.string().trim().min(20, "Tell us a little more: at least a sentence or two").max(2000),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  contactPhone: optionalText(32).refine((value) => value === null || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number"),
  website: optionalText(300).refine((value) => value === null || /^https?:\/\/\S+\.\S+/.test(value), "Enter a full web address starting with https://"),
  addressLine: optionalText(200),
  city: z.string().trim().min(2, "Enter the city").max(80),
  stateCode: z.string().refine(isIndianStateCode, "Choose a state or union territory"),
  postalCode: optionalText(12).refine((value) => value === null || /^[0-9]{6}$/.test(value), "Enter a 6-digit PIN code"),
});

export const organisationApplicationSchema = organisationProfileSchema.extend({ slug: organisationSlugSchema });

export type OrganisationProfile = z.infer<typeof organisationProfileSchema>;

/** The application as it stood at a submit, kept on the review row for the reviewer. */
export function applicationSnapshot(profile: OrganisationProfile & { slug: string }): Prisma.InputJsonValue {
  return { ...profile, submittedAt: new Date().toISOString() };
}

/** Verified platform admins who should hear about new applications. */
async function platformAdminEmails(client: OutboxClient): Promise<string[]> {
  const flagged = await client.user.findMany({
    where: { emailVerified: { not: null }, email: { not: null }, isSuperAdmin: true },
    select: { email: true },
    take: 50,
  });
  return [...new Set(flagged.map((user) => user.email!.toLowerCase()))];
}

/** Queue a lifecycle email to every owner of an organisation (within the caller's transaction). */
export async function notifyOwners(client: OutboxClient, organisationId: string, notice: OrganisationNotice, reason?: string | null) {
  const owners = await client.teamMember.findMany({
    where: { organisationId, orgRole: { is: { isOwner: true } }, user: { email: { not: null } } },
    select: { user: { select: { email: true } } },
    take: 20,
  });
  for (const owner of owners) {
    await enqueueOutbox(client, "organisation-notice", { to: owner.user.email!, organisationId, notice, ...(reason ? { reason } : {}) });
  }
}

/** Tell every platform admin about a new or updated application. */
export async function alertPlatformAdmins(client: OutboxClient, organisationId: string, resubmitted = false) {
  for (const to of await platformAdminEmails(client)) {
    await enqueueOutbox(client, "organisation-application-alert", { to, organisationId, ...(resubmitted ? { resubmitted: true } : {}) });
  }
}

const SLUG_HOLD_DAYS = 30;

/**
 * A declined application keeps its web address for 30 days, so links in its emails keep working.
 * After that, a new application may take the address: the old record moves to a unique address.
 */
export function isSlugReleasable(holder: { status: OrganisationStatus; updatedAt: Date }, now = new Date()) {
  return holder.status === OrganisationStatus.REJECTED && now.getTime() - holder.updatedAt.getTime() >= SLUG_HOLD_DAYS * 24 * 60 * 60_000;
}

export async function releaseHeldSlug(client: Prisma.TransactionClient, slug: string, now = new Date()) {
  const holder = await client.organisation.findUnique({ where: { slug }, select: { id: true, status: true, updatedAt: true } });
  if (!holder || !isSlugReleasable(holder, now)) return false;
  await client.organisation.update({ where: { id: holder.id }, data: { slug: `declined-${holder.id}` } });
  return true;
}
