"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { getLoginSwitches, invalidateLoginMethodsCache } from "@/lib/loginMethods";
import { LOGIN_METHODS, LOGIN_SWITCH_FIELDS, loginMethodsFromEnv } from "@/lib/loginMethodsCore";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

// Each switch is optional: a method left out keeps its current setting.
const schema = z.object(Object.fromEntries(LOGIN_METHODS.map((method) => [method, z.boolean().optional()])) as Record<(typeof LOGIN_METHODS)[number], z.ZodOptional<z.ZodBoolean>>);

/**
 * Switch sign-in methods on or off. A switch is only an AND in front of the method's configuration, and switching a
 * method off never deletes its credentials. Refused while the server's LOGIN_METHODS decides.
 */
export async function saveLoginMethods(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  if (loginMethodsFromEnv()) return { ok: false, error: "The server sets the sign-in methods (LOGIN_METHODS). Change them there." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the sign-in switches." };
  const before = await getLoginSwitches();
  const given = LOGIN_METHODS.filter((method) => parsed.data[method] !== undefined);
  const fields = Object.fromEntries(given.map((method) => [LOGIN_SWITCH_FIELDS[method], parsed.data[method]]));
  const changed = given.filter((method) => before[method] !== parsed.data[method]).map((method) => LOGIN_SWITCH_FIELDS[method]);
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, ...fields }, update: fields });
  if (changed.length) {
    await recordAuditEvent({ action: "LOGIN_METHODS_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { changed: changed.join(",") } });
  }
  invalidateLoginMethodsCache();
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}
