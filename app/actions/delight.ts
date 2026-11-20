"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { invalidateOrg } from "@/lib/cache";
import { orgActionAccess } from "@/lib/permissions";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * Turn the organisation's playful touches on or off (Organisation.delightEnabled, on by default; CR-MOTION-01).
 * Off, its public and member pages skip the card tilt and sheen, the plan-card stagger, the join arrival and Patch's
 * sneeze. Reduced motion on a device turns them off whatever this says.
 */
export async function setDelightEnabled(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: z.string().trim().min(1).max(64), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.settings");
  if (!ctx.ok) return ctx;
  await prisma.organisation.update({ where: { id: ctx.organisation.id }, data: { delightEnabled: parsed.data.enabled } });
  await recordAuditEvent({ action: "DELIGHT_SET", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, metadata: { enabled: parsed.data.enabled } });
  await invalidateOrg(ctx.organisation.id, "public-page");
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings`);
  revalidatePath(`/o/${ctx.organisation.slug}`, "layout");
  revalidatePath("/account");
  return { ok: true };
}
