"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { countCondition, smartGroupConditionSchema } from "@/lib/groups/conditions";
import { referenceProblem } from "@/lib/groups/references";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const slug = z.string().trim().min(1);
const id = z.string().trim().min(1).max(64);
const MAX_SMART_GROUPS = 100;

async function access(organisationSlug: unknown) {
  const result = await orgActionAccess(organisationSlug, "members.manage");
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return result;
}

const saveSchema = z.object({
  organisationSlug: slug,
  smartGroupId: id.optional(),
  name: z.string().trim().min(2, "Name the group").max(80),
  description: z.string().trim().max(300).optional().default(""),
  condition: smartGroupConditionSchema,
});

/** Save a smart group: a name and a condition, validated here and checked against this organisation's data. */
export async function saveSmartGroup(input: unknown): Promise<ActionResult<{ smartGroupId: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  const problem = await referenceProblem(organisationId, parsed.data.condition);
  if (problem) return { ok: false, error: problem };
  const data = { name: parsed.data.name, description: parsed.data.description, condition: parsed.data.condition as Prisma.InputJsonValue };
  try {
    const saved = parsed.data.smartGroupId
      ? await prisma.smartGroup.updateMany({ where: { id: parsed.data.smartGroupId, organisationId }, data }).then(async (result) => (result.count === 1 ? { id: parsed.data.smartGroupId! } : null))
      : (await prisma.smartGroup.count({ where: { organisationId } })) >= MAX_SMART_GROUPS ? null : await prisma.smartGroup.create({ data: { ...data, organisationId, createdById: ctx.userId }, select: { id: true } });
    if (!saved) return { ok: false, error: parsed.data.smartGroupId ? "Smart group not found." : "This organisation has reached the smart group limit." };
    await recordAuditEvent({ action: parsed.data.smartGroupId ? "SMART_GROUP_UPDATED" : "SMART_GROUP_CREATED", actorUserId: ctx.userId, organisationId, targetType: "SmartGroup", targetId: saved.id });
    revalidatePath(`/dashboard/${ctx.organisation.slug}/members/smart-groups`);
    revalidatePath(`/dashboard/${ctx.organisation.slug}/members`);
    return { ok: true, data: { smartGroupId: saved.id } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "Another smart group already uses that name.", fieldErrors: { name: ["Already used"] } };
    throw error;
  }
}

/** Delete a smart group. Nothing is stored per member, so this removes only the saved condition. */
export async function deleteSmartGroup(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: slug, smartGroupId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const removed = await prisma.smartGroup.deleteMany({ where: { id: parsed.data.smartGroupId, organisationId: ctx.organisation.id } });
  if (removed.count !== 1) return { ok: false, error: "Smart group not found." };
  await recordAuditEvent({ action: "SMART_GROUP_DELETED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "SmartGroup", targetId: parsed.data.smartGroupId });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/members/smart-groups`);
  revalidatePath(`/dashboard/${ctx.organisation.slug}/members`);
  return { ok: true };
}

/** How many members a condition covers inside the viewer's own reach: a count only, never names. */
export async function previewSmartGroupCount(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = z.object({ organisationSlug: slug, condition: smartGroupConditionSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That condition isn't complete yet." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  if (await referenceProblem(ctx.organisation.id, parsed.data.condition)) return { ok: false, error: "That condition names something that no longer exists." };
  return { ok: true, data: { count: await countCondition(await teamScope(ctx.organisation.id, ctx.membership), parsed.data.condition) } };
}
