"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { acceptOrganisationInviteToken } from "@/lib/inviteAcceptance";
import type { ActionResult } from "./org";

const tokenSchema = z.string().trim().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/);

export async function acceptOrganisationInvite(input: unknown): Promise<ActionResult<{ href: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in before accepting this invite." };
  const token = tokenSchema.safeParse(input);
  if (!token.success) return { ok: false, error: "This invite is unavailable." };
  if (await isActionRateLimited("invite", session.user.id)) return { ok: false, error: "Too many attempts. Please try again later." };
  // Read from the database: session JWTs can be stale about the verified email.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (!user) return { ok: false, error: "Sign in before accepting this invite." };
  const result = await acceptOrganisationInviteToken(token.data, { id: session.user.id, email: user.email, emailVerified: user.emailVerified != null });
  if (result.ok) return { ok: true, data: { href: result.href } };
  const errors = {
    "wrong-account": "Sign in with the verified email address this invite was sent to.",
    "team-full": "This organisation's team is full. Ask whoever sent the invite to make room, then try again.",
    unavailable: "This invite is unavailable.",
  } as const;
  return { ok: false, error: errors[result.reason] };
}
