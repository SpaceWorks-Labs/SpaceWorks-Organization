"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { loadLoginMethods } from "@/lib/loginMethods";
import { beginRegistration, finishRegistration, removePasskey as removeOwnPasskey, renamePasskey as renameOwnPasskey } from "@/lib/passkeys/manage";
import type { ActionResult } from "./org";

const BUSY = "Too many attempts. Try again later.";
const idSchema = z.object({ id: z.string().min(1).max(64) });
const renameSchema = idSchema.extend({ name: z.string().trim().min(1, "Enter a name.").max(60, "Use 60 characters or fewer.") });
const attestationSchema = z.object({ id: z.string().min(1).max(1400), rawId: z.string(), type: z.literal("public-key"), response: z.object({}).passthrough() }).passthrough();

/** The signed-in person, when passkeys are available to them: the method is on and they are not a super admin. */
async function passkeyUser() {
  const session = await requireAuth();
  const [{ available }, user] = await Promise.all([
    loadLoginMethods(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true, isSuperAdmin: true } }),
  ]);
  if (!available.includes("passkey")) return { error: "Passkeys are not switched on here." } as const;
  if (!user?.email || user.isSuperAdmin) return { error: "Passkeys are not available for this account." } as const;
  return { user: { id: user.id, email: user.email, name: user.name } } as const;
}

/** Start adding a passkey: the options for navigator.credentials.create. Needs a recent sign-in. */
export async function beginPasskeyRegistration(): Promise<ActionResult<unknown>> {
  const found = await passkeyUser();
  if (!found.user) return { ok: false, error: found.error };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before adding a passkey." };
  if (await isActionRateLimited("auth", found.user.id)) return { ok: false, error: BUSY };
  return beginRegistration(found.user);
}

/** Finish adding a passkey with the browser's response. */
export async function finishPasskeyRegistration(input: unknown): Promise<ActionResult<{ id: string }>> {
  const found = await passkeyUser();
  if (!found.user) return { ok: false, error: found.error };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before adding a passkey." };
  if (await isActionRateLimited("auth", found.user.id)) return { ok: false, error: BUSY };
  const parsed = attestationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That passkey could not be verified. Try again." };
  return finishRegistration(found.user.id, parsed.data as unknown as RegistrationResponseJSON, (await headers()).get("user-agent"));
}

export async function renamePasskey(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: BUSY };
  return renameOwnPasskey(session.user.id, parsed.data.id, parsed.data.name);
}

/** Remove one of your own passkeys. Refused when it is the last working way to sign in. */
export async function removePasskey(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That passkey no longer exists." };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before removing a passkey." };
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: BUSY };
  return removeOwnPasskey(session.user.id, parsed.data.id, await loadLoginMethods());
}
