"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { orgActionAccess } from "@/lib/permissions";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * Turn member accounts on or off. Off, the organisation just keeps records: members get no portal for it,
 * "Pay now" emails carry signed pay links, and card checks on /verify carry on as before.
 */
export async function setMemberPortal(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: z.string().trim().min(1).max(64), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.settings");
  if (!ctx.ok) return ctx;
  await prisma.organisation.update({ where: { id: ctx.organisation.id }, data: { memberPortal: parsed.data.enabled } });
  await recordAuditEvent({ action: "MEMBER_PORTAL_SET", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, metadata: { enabled: parsed.data.enabled } });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings`);
  revalidatePath("/account");
  return { ok: true };
}

/** Whether members may upload or replace the photo on their own card from their account. Managers always can. */
export async function setMemberPhotoUpload(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: z.string().trim().min(1).max(64), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.settings");
  if (!ctx.ok) return ctx;
  await prisma.organisation.update({ where: { id: ctx.organisation.id }, data: { memberPhotoUpload: parsed.data.enabled } });
  await recordAuditEvent({ action: "MEMBER_PHOTO_UPLOAD_SET", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, metadata: { enabled: parsed.data.enabled } });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings`);
  revalidatePath("/account");
  return { ok: true };
}
