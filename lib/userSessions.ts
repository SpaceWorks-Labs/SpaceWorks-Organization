import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isOidcProviderId } from "@/lib/oidc/providers";
import { deviceLabel, recognisedDevice } from "@/lib/loginSecurity";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { activeLinkTarget } from "@/lib/linkSession";

/**
 * Server-side sessions (product rules section 15, Sessions). The Auth.js JWT carries the row's id (`sid`); the jwt
 * callback checks the row on every request, so one signed-in device can be ended without ending the others.
 * `lastSeenAt` is written at most once every five minutes. `ipPrefix` keeps only the first two octets of an IPv4
 * address or the first /48 of an IPv6 one, enough to tell places apart, never the address.
 */
export const LAST_SEEN_EVERY_MS = 5 * 60_000;
const KEEP_AFTER_LAST_SEEN_MS = 60 * 86_400_000;
const LIST_WINDOW_MS = 30 * 86_400_000;
const LIST_LIMIT = 25;

const METHODS = ["password", "google", "apple", "github", "saml", "supabase", "firebase", "passkey", "phone"] as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** The method a session was started with, from the Auth.js provider id ("credentials" is the password form). */
export function sessionMethod(provider: string | undefined) {
  if (!provider || provider === "credentials") return "password";
  if (isOidcProviderId(provider)) return "oidc";
  return (METHODS as readonly string[]).includes(provider) ? provider : "password";
}

/** The first two octets of an IPv4 address, or the first three groups (/48) of an IPv6 one; null for anything else. */
export function ipPrefix(ip: string | null | undefined) {
  if (!ip) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 2).join(".");
  if (!ip.includes(":") || !/^[0-9a-f:]+$/i.test(ip)) return null;
  const [head, tail = ""] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back] : front;
  return groups.slice(0, 3).map((group) => group.toLowerCase()).join(":");
}

async function requestContext() {
  try {
    const incoming = await headers();
    return { label: deviceLabel(incoming.get("user-agent")), prefix: ipPrefix(getClientIpFromHeaders(incoming)) };
  } catch {
    return { label: "", prefix: null };
  }
}

/**
 * Record a sign-in and return the session id for the token. Linking another method from a signed-in browser keeps that
 * browser's existing session instead of starting a second one.
 */
export async function startUserSession(userId: string, sessionVersion: number, provider: string | undefined) {
  const linking = provider ? await activeLinkTarget(provider).catch(() => null) : null;
  if (linking?.userId === userId) return linking.sid;
  const { label, prefix } = await requestContext();
  const known = await recognisedDevice(userId).catch(() => null);
  const row = await prisma.userSession.create({
    data: { userId, sessionVersion, userAgent: label, ipPrefix: prefix, method: sessionMethod(provider), knownDeviceId: known?.id ?? null },
    select: { id: true },
  });
  // Rows nothing can use any more (the cookie lasts 30 days from the last request) are dropped as people sign in.
  await prisma.userSession.deleteMany({ where: { userId, lastSeenAt: { lt: new Date(Date.now() - KEEP_AFTER_LAST_SEEN_MS) } } }).catch(() => undefined);
  return row.id;
}

/**
 * One indexed lookup per request: the session row with its user's current version. Returns that version when the row
 * is live (exists, is this user's, not revoked, made under this version), else null, and the caller signs the person out.
 */
export async function checkUserSession(sid: string | undefined, userId: string, now = Date.now()) {
  if (!sid) return null;
  const row = await prisma.userSession.findUnique({
    where: { id: sid },
    select: { userId: true, revokedAt: true, lastSeenAt: true, sessionVersion: true, user: { select: { sessionVersion: true } } },
  });
  if (!row || row.userId !== userId || row.revokedAt || row.sessionVersion !== row.user.sessionVersion) return null;
  if (now - row.lastSeenAt.getTime() >= LAST_SEEN_EVERY_MS) {
    // After the response: the throttled write never holds up the request.
    const touch = () => prisma.userSession.updateMany({ where: { id: sid, revokedAt: null }, data: { lastSeenAt: new Date(now) } }).catch(() => undefined);
    try { after(touch); } catch { void touch(); }
  }
  return row.user.sessionVersion;
}

/** Signed-in devices for the security page: live sessions of the current version, newest activity first. */
export async function listUserSessions(userId: string, sessionVersion: number, currentSid: string | undefined) {
  const rows = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, sessionVersion, lastSeenAt: { gt: new Date(Date.now() - LIST_WINDOW_MS) } },
    orderBy: { lastSeenAt: "desc" },
    take: LIST_LIMIT,
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ipPrefix: true, method: true },
  });
  return rows.map((row) => ({
    id: row.id, current: row.id === currentSid, label: row.userAgent || "A browser", ipPrefix: row.ipPrefix, method: row.method,
    createdAt: row.createdAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(),
  }));
}

/** End one of this user's sessions. False when it is not theirs, or already ended. */
export async function revokeUserSession(userId: string, sid: string, client: Db = prisma) {
  const ended = await client.userSession.updateMany({ where: { id: sid, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return ended.count === 1;
}

export async function revokeAllUserSessions(userId: string, client: Db = prisma) {
  await client.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
