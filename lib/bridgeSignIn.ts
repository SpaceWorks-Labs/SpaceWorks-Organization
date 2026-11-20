import "server-only";

import { CredentialsSignin } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { firebaseConfig, supabaseConfig } from "@/lib/authBridges";
import { verifyFirebaseIdToken, verifySupabaseToken, type BridgeRefusal } from "@/lib/bridgeTokens";
import { identityRefusal } from "@/lib/signInRules";
import { recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { auditIdentityLinked } from "@/lib/authAudit";
import { activeLinkTarget } from "@/lib/linkSession";
import { linkExternalIdentity } from "@/lib/authMethods/link";
import { getClientIpFromHeaders } from "@/lib/rateLimit";

export type BridgeProvider = "supabase" | "firebase";

/** A sign-in refusal whose `code` reaches the login page through Auth.js. */
class BridgeSignInError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

const inputSchema = z.object({ token: z.string().min(20).max(8192) });
const refusalCode: Record<BridgeRefusal, string> = {
  invalid_token: "bridge_failed",
  unverified_email: "unverified_email",
  no_email: "bridge_no_email",
  unsupported_signing_key: "bridge_unavailable",
  unavailable: "bridge_unavailable",
};

/**
 * Auth.js Credentials `authorize` for the Supabase and Firebase bridges. The browser signed in with the provider's
 * SDK and posts its token; nothing is trusted until the token verifies and carries a verified email. Then the same
 * rules as Google, Apple and GitHub apply (lib/signInRules.ts), and the provider's `sub` is linked as an Account.
 */
export async function authorizeBridge(provider: BridgeProvider, raw: unknown, request: Request) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const ip = getClientIpFromHeaders(request.headers);
  if (await isIpBlocked(ip)) throw new BridgeSignInError("address_blocked");
  if (await isActionRateLimited("auth")) return null;

  const supabase = provider === "supabase" ? supabaseConfig() : null;
  const firebase = provider === "firebase" ? firebaseConfig() : null;
  if (!supabase && !firebase) throw new BridgeSignInError("bridge_unavailable");
  const result = supabase ? await verifySupabaseToken(parsed.data.token, supabase) : await verifyFirebaseIdToken(parsed.data.token, firebase!);
  if (!result.ok) {
    if (result.reason === "invalid_token" && (await recordFailedLogin(ip))) throw new BridgeSignInError("address_blocked");
    throw new BridgeSignInError(refusalCode[result.reason]);
  }
  const { sub, name } = result.identity;
  // Accounts are keyed by the lowercased email everywhere; never let a case variant create a second account.
  const email = result.identity.email.trim().toLowerCase();

  // From a signed-in browser that asked to add this provider: link it to that user, never by email, and keep the session.
  const target = await activeLinkTarget(provider);
  if (target) {
    const linkedNow = await linkExternalIdentity(target.userId, provider, "oidc", sub);
    if (!linkedNow.ok) throw new BridgeSignInError(linkedNow.code);
    return linkedNow.user;
  }

  const refusal = await identityRefusal(email, provider, sub);
  if (refusal) throw new BridgeSignInError(refusal === "blocked" ? "bridge_failed" : refusal);

  const select = { id: true, name: true, email: true, image: true, sessionVersion: true, emailVerified: true, isSuperAdmin: true } as const;
  const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: sub } }, select: { user: { select } } });
  let user = linked?.user ?? null;
  if (!linked) {
    // Never link a bridge identity to an existing account by email: a Supabase or Firebase project could confirm an
    // address it never checked (for example with "Confirm email" off), which would hand over someone else’s account,
    // authenticator and all. A bridge signs in only the account it created, found again by the provider’s own id.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new BridgeSignInError("bridge_link_refused");
  }
  if (user?.isSuperAdmin) throw new BridgeSignInError("super_admin_password_only");

  try {
    if (!user) {
      // Create the account and its link together, so a half-made account can never be found by email later.
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, name, emailVerified: new Date() }, select });
        await tx.account.create({ data: { userId: created.id, type: "oidc", provider, providerAccountId: sub } });
        return created;
      });
      await auditIdentityLinked(user.id, provider);
    }
  } catch (error) {
    // Two sign-ins racing to create the same account: read what the winner linked to this provider id, never by email.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: sub } }, select: { user: { select } } });
    user = winner?.user ?? null;
    if (!user || user.isSuperAdmin) throw new BridgeSignInError("bridge_failed");
  }

  // The provider proved the identity; still remember the browser and alert on a new one.
  await rememberDevice(user.id, await recognisedDevice(user.id));
  return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
}
