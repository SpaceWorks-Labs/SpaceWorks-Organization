"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { confirmPhone, removePhone, startPhoneVerification } from "@/lib/sms/account";
import type { ActionResult } from "./org";

const numberSchema = z.object({ phone: z.string().trim().max(40) });
const confirmSchema = numberSchema.extend({ code: z.string().trim().min(6).max(12) });

/** Common to all three: a live session, signed in recently, and the per-person limits. */
async function gate(bucket: "auth" | "smsCode"): Promise<{ userId: string } | { error: string }> {
  const session = await requireAuth();
  if (await isActionRateLimited(bucket, session.user.id)) return { error: "Too many attempts. Please try again later." };
  if (!(await hasRecentAuthentication())) return { error: "Sign in again before changing your phone number." };
  return { userId: session.user.id };
}

/** Text a verification code to a number, to add it to the account or replace the saved one. */
export async function sendPhoneCode(input: unknown): Promise<ActionResult> {
  const parsed = numberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the number with its country code, such as +91 98765 43210." };
  const allowed = await gate("smsCode");
  if ("error" in allowed) return { ok: false, error: allowed.error };
  return startPhoneVerification(allowed.userId, parsed.data.phone);
}

/** Confirm the code from the text message; the number becomes the account's verified phone. */
export async function confirmPhoneCode(input: unknown): Promise<ActionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the six-digit code from the text message." };
  const allowed = await gate("auth");
  if ("error" in allowed) return { ok: false, error: allowed.error };
  return confirmPhone(allowed.userId, parsed.data.phone, parsed.data.code);
}

/** Remove the phone number, unless it is the last working way to sign in. */
export async function removePhoneNumber(): Promise<ActionResult> {
  const allowed = await gate("auth");
  if ("error" in allowed) return { ok: false, error: allowed.error };
  return removePhone(allowed.userId);
}
