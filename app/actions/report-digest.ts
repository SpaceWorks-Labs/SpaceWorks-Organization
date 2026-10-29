"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import type { ActionResult } from "./org";

const schema = z.object({ organisationSlug: z.string().trim().min(1).max(64), enabled: z.boolean() });

/** Switch your own monthly summary email for this organisation on or off. */
export async function setReportDigest(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "org.view");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  // Platform access has no team row and gets no organisation's digest.
  if (access.membership.superAdmin) return { ok: false, error: "Monthly summaries go to the organisation's team." };
  await prisma.teamMember.update({ where: { id: access.membership.id }, data: { reportDigest: parsed.data.enabled } });
  return { ok: true };
}
