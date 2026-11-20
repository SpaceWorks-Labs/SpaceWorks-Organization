import "server-only";

import { cookies } from "next/headers";
import { INVITE_COOKIE_TTL_MS, signInviteCookie, verifyInviteCookie } from "@/lib/inviteLink";

export const INVITE_COOKIE = "swo.invite-signup";

export async function setInviteCookie(token: string) {
  // Apple returns with a cross-site form POST, which drops SameSite=Lax cookies; over HTTPS in production the note is
  // SameSite=None so a sign-up started from an invite still finds it. It is signed and grants nothing on its own.
  const secure = process.env.NODE_ENV === "production" && process.env.ALLOW_PLAIN_HTTP !== "1";
  (await cookies()).set(INVITE_COOKIE, signInviteCookie(token), {
    httpOnly: true, sameSite: secure ? "none" : "lax", secure, path: "/", maxAge: INVITE_COOKIE_TTL_MS / 1000,
  });
}

/** The invite token this browser's cookie vouches for, or null. */
export async function readInviteCookie() {
  return verifyInviteCookie((await cookies()).get(INVITE_COOKIE)?.value);
}

export async function clearInviteCookie() {
  (await cookies()).delete(INVITE_COOKIE);
}
