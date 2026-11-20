"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { queueManualReminders } from "@/lib/reports/reminders";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const schema = z.object({
  organisationSlug: z.string().trim().min(1).max(100),
  termIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
});

/**
 * B3 bulk reminder: queue the renewal-reminder email for the chosen memberships, through the same outbox
 * kind and ReminderLog as the sweep's automatic reminders. Each membership gets at most one manual
 * reminder per day; memberships outside the manager's unit scope, renewed or not in a renewable state are
 * skipped, never errors.
 */
export async function sendRenewalReminders(input: unknown): Promise<{ ok: true; queued: number; skipped: number } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose between 1 and 200 memberships." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: access.organisation.id }, select: { id: true, slug: true, timezone: true } });
  const scope = await teamScope(org.id, access.membership);
  const result = await queueManualReminders(scope, org.timezone, [...new Set(parsed.data.termIds)]);
  await recordAuditEvent({ action: "RENEWAL_REMINDERS_SENT", actorUserId: access.userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { requested: parsed.data.termIds.length, queued: result.queued, skipped: result.skipped } });
  revalidatePath(`/dashboard/${org.slug}/reports/renewals`);
  return { ok: true, ...result };
}
