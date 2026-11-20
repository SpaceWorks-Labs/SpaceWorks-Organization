"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { auditSessionRevoked } from "@/lib/authAudit";
import { revokeUserSession } from "@/lib/userSessions";
import type { ActionResult } from "./org";

const schema = z.object({ sessionId: z.string().min(1).max(64) });

/**
 * Sign one signed-in device out (product rules section 15, Sessions). Only the caller's own sessions can be named:
 * anyone else's id, or one already ended, is answered the same way. `current` tells the browser to sign out here too.
 */
export async function revokeSession(input: unknown): Promise<ActionResult<{ current: boolean }>> {
  const session = await requireAuth();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That device could not be found." };
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: "Too many attempts. Try again later." };
  const row = await prisma.userSession.findFirst({ where: { id: parsed.data.sessionId, userId: session.user.id, revokedAt: null }, select: { method: true } });
  if (!row || !(await revokeUserSession(session.user.id, parsed.data.sessionId))) return { ok: false, error: "That device could not be found." };
  await auditSessionRevoked(session.user.id, row.method);
  return { ok: true, data: { current: parsed.data.sessionId === (session as { sid?: string }).sid } };
}
