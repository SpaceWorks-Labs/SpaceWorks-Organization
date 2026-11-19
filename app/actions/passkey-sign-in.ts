"use server";

import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { loadLoginMethods } from "@/lib/loginMethods";
import { passkeyRelyingParty } from "@/lib/passkeys/config";
import { saveSignInChallenge } from "@/lib/passkeys/challenges";
import type { ActionResult } from "./org";

/**
 * Start a passkey sign-in: the options for navigator.credentials.get. No account is named (discoverable
 * credentials) and user verification is required. The challenge is kept on the server and named by an opaque cookie;
 * the Auth.js "passkey" provider uses it up. Refused when the method is off.
 */
export async function beginPasskeySignIn(): Promise<ActionResult<unknown>> {
  if (!(await loadLoginMethods()).available.includes("passkey")) return { ok: false, error: "That way of signing in isn’t switched on here. Use another option." };
  if (await isActionRateLimited("auth")) return { ok: false, error: "Too many attempts. Wait a little while, then try again." };
  const options = await generateAuthenticationOptions({ rpID: passkeyRelyingParty().rpID, userVerification: "required" });
  await saveSignInChallenge(options.challenge);
  return { ok: true, data: options };
}
