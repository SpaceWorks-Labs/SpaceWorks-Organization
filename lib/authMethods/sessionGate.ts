import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { auditSignInFailed } from "@/lib/authAudit";
import { activeLinkTarget, readRequestSession } from "@/lib/linkSession";
import { sessionCookieName } from "@/lib/sessionCookie";
import { linkRefusal } from "./link";

/**
 * Auth.js links an OAuth or OpenID Connect identity to whoever its own session cookie decodes to, without asking
 * whether that session still counts. This runs first in the sign-in callback so it never does so by accident.
 *
 * - No cookie: undefined, the ordinary sign-in goes on.
 * - A live session: the identity is added to that user only when this browser asked for it (a signed link intent that
 *   covers the provider, set by a server action) and the identity is not another account's: true. An identity already
 *   linked to that user goes on as an ordinary sign-in. Anything else is turned back to the security page.
 * - A session that no longer counts (revoked, or made under an old version): only an identity already linked to that
 *   same user passes; otherwise the dead cookie is cleared and the person asks again, so nothing is linked to it.
 */
export async function oauthSessionGate(provider: string, providerAccountId: string): Promise<true | string | undefined> {
  const session = await readRequestSession();
  if (session.state === "none") return undefined;
  const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, select: { userId: true } });
  if (session.state === "stale") {
    if (linked && linked.userId === session.userId) return undefined;
    (await cookies()).delete(sessionCookieName());
    await auditSignInFailed(provider, "session_ended");
    return "/login?error=session_expired";
  }
  if (linked?.userId === session.userId) return undefined;
  if (!(await activeLinkTarget(provider))) {
    await auditSignInFailed(provider, "link_not_requested");
    return "/account/security?link=not_requested";
  }
  const refusal = await linkRefusal(session.userId, provider, providerAccountId);
  if (!refusal) return true;
  await auditSignInFailed(provider, refusal);
  return `/account/security?link=${refusal}`;
}
