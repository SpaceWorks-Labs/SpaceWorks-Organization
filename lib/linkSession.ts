import "server-only";

import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { sessionCookieName } from "@/lib/sessionCookie";
import { LINK_INTENT_COOKIE, LINK_INTENT_TTL_MS, intentCoversProvider, signLinkIntent, verifyLinkIntent, type LinkIntent } from "@/lib/linkIntent";

/**
 * What this request's session cookie says, read straight from the cookie and the session row (not through Auth.js).
 * Auth.js links an outside identity to whoever its own cookie decodes to, even after the session was revoked, so the
 * sign-in callback needs to know first: "live" (a current session), "stale" (a cookie that no longer counts) or "none".
 */
export type RequestSession = { state: "none" } | { state: "stale"; userId: string | null } | { state: "live"; userId: string; sid: string };

export async function readRequestSession(): Promise<RequestSession> {
  try {
    const name = sessionCookieName();
    const token = (await cookies()).get(name)?.value;
    if (!token) return { state: "none" };
    const secret = process.env.AUTH_SECRET;
    const decoded = secret ? await decode({ token, secret, salt: name }) : null;
    const sid = typeof decoded?.sid === "string" ? decoded.sid : null;
    if (!decoded?.sub || !sid) return { state: "stale", userId: decoded?.sub ?? null };
    const row = await prisma.userSession.findUnique({ where: { id: sid }, select: { userId: true, revokedAt: true, sessionVersion: true, user: { select: { sessionVersion: true } } } });
    const live = row && row.userId === decoded.sub && !row.revokedAt && row.sessionVersion === row.user.sessionVersion && decoded.sessionVersion === row.sessionVersion;
    return live ? { state: "live", userId: row.userId, sid } : { state: "stale", userId: decoded.sub };
  } catch {
    return { state: "stale", userId: null };
  }
}

/** Remember, for ten minutes, that this signed-in browser is adding `provider` to this user (server actions only). */
export async function setLinkIntent(intent: LinkIntent) {
  const secure = process.env.NODE_ENV === "production" && process.env.ALLOW_PLAIN_HTTP !== "1";
  (await cookies()).set(LINK_INTENT_COOKIE, signLinkIntent(intent), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: LINK_INTENT_TTL_MS / 1000 });
}

export async function clearLinkIntent() {
  (await cookies()).delete(LINK_INTENT_COOKIE);
}

/**
 * The live session to link `provider` to: a valid link intent that covers this provider AND a live session of the very
 * user the intent names. Null for anything else (no intent, forged, expired, another provider, session gone or changed).
 */
export async function activeLinkTarget(provider: string): Promise<{ userId: string; sid: string } | null> {
  const intent = verifyLinkIntent((await cookies()).get(LINK_INTENT_COOKIE)?.value);
  if (!intent || !intentCoversProvider(intent, provider)) return null;
  const session = await readRequestSession();
  return session.state === "live" && session.userId === intent.userId ? { userId: session.userId, sid: session.sid } : null;
}
