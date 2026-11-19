import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { PASSKEY_CHALLENGE_TTL_MS } from "./config";

const SIGN_IN_COOKIE = "swo.passkey-challenge";
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** Registration challenges are bound to the signed-in person; a new one replaces the last. */
export const registrationKey = (userId: string) => `reg:${userId}`;

/** Store a challenge under a key, replacing any earlier one and sweeping the expired. */
export async function saveChallenge(key: string, kind: "register" | "sign-in", challenge: string, now = Date.now()) {
  const expiresAt = new Date(now + PASSKEY_CHALLENGE_TTL_MS);
  await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);
  await prisma.passkeyChallenge.upsert({ where: { key }, create: { key, kind, challenge, expiresAt }, update: { kind, challenge, expiresAt } });
}

/** The current, unexpired challenge for a key and kind, without using it up. */
export async function peekChallenge(key: string, kind: "register" | "sign-in", now = Date.now()) {
  const row = await prisma.passkeyChallenge.findFirst({ where: { key, kind, expiresAt: { gt: new Date(now) } }, select: { challenge: true } });
  return row?.challenge ?? null;
}

/** Use a challenge up. True for exactly one caller, even when two race for it. */
export async function consumeChallenge(key: string, now = Date.now()) {
  const used = await prisma.passkeyChallenge.deleteMany({ where: { key, expiresAt: { gt: new Date(now) } } });
  return used.count === 1;
}

/** Drop a challenge without using it (a failed attempt must not be retried against the same challenge). */
export async function discardChallenge(key: string) {
  await prisma.passkeyChallenge.deleteMany({ where: { key } });
}

/** Start a sign-in challenge: an opaque random cookie names it, so the page never holds a way to read or reuse one. */
export async function saveSignInChallenge(challenge: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await saveChallenge(`sin:${sha256(token)}`, "sign-in", challenge);
  (await cookies()).set(SIGN_IN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: PASSKEY_CHALLENGE_TTL_MS / 1000 });
}

/** The key of the sign-in challenge this browser holds, or null. */
export async function signInChallengeKey() {
  const token = (await cookies()).get(SIGN_IN_COOKIE)?.value;
  return token && token.length <= 100 ? `sin:${sha256(token)}` : null;
}

export async function clearSignInCookie() {
  (await cookies()).delete(SIGN_IN_COOKIE);
}
