import "server-only";

import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { getClientIpFromHeaders } from "@/lib/rateLimit";

/**
 * Sign-ins from somewhere new. Each browser that signs in gets a long-lived random cookie, stored only as a
 * hash. Accounts without an authenticator must enter a code emailed to them when signing in from a browser we
 * don't know (unless they verified their email in the last hour); every first sign-in from a new device also
 * emails an alert.
 */
const DEVICE_COOKIE = "swo.device";
const DEVICE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 60_000;
const JUST_VERIFIED_MS = 60 * 60_000;
const DEVICES_KEPT = 20;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const codeIdentifier = (userId: string) => `login-code:${userId}`;

/** "Chrome on Windows", from the user agent, for alerts and the device list. Never the full string. */
export function deviceLabel(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}

export function justVerified(emailVerified: Date | null, now = Date.now()) {
  return Boolean(emailVerified && now - emailVerified.getTime() < JUST_VERIFIED_MS);
}

/** The known device this browser belongs to, for this account; null when it's new to the account. */
export async function recognisedDevice(userId: string) {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return prisma.knownDevice.findFirst({ where: { userId, tokenHash: sha256(token) }, select: { id: true } });
}

/** Email a six-digit code, at most once a minute; an earlier unexpired code is replaced. */
export async function issueLoginCode(user: { id: string; email: string }, now = Date.now()) {
  const current = await prisma.verificationToken.findFirst({ where: { identifier: codeIdentifier(user.id), expires: { gt: new Date(now) } }, select: { expires: true } });
  if (current && current.expires.getTime() - now > CODE_TTL_MS - RESEND_AFTER_MS) return;
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expires = new Date(now + CODE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier: codeIdentifier(user.id) } });
    await tx.verificationToken.create({ data: { identifier: codeIdentifier(user.id), token: sha256(`${user.id}:${code}`), expires } });
    await enqueueOutbox(tx, "login-code", { to: user.email, code, expiresAt: expires.toISOString() });
  });
}

/** Use up a code; true only for the current, unexpired one. */
export async function consumeLoginCode(userId: string, code: string) {
  if (!/^\d{6}$/.test(code.trim())) return false;
  const used = await prisma.verificationToken.deleteMany({ where: { identifier: codeIdentifier(userId), token: sha256(`${userId}:${code.trim()}`), expires: { gt: new Date() } } });
  return used.count === 1;
}

/**
 * After a successful sign-in: refresh a known device, or remember this new one (cookie plus hashed row), keep
 * only the latest few, and queue the new-sign-in alert.
 */
export async function rememberDevice(userId: string, known: { id: string } | null) {
  const incoming = await headers();
  const ip = getClientIpFromHeaders(incoming);
  const lastIp = ip && ip !== "unknown" ? ip.slice(0, 64) : null;
  if (known) {
    await prisma.knownDevice.update({ where: { id: known.id }, data: { lastSeenAt: new Date(), lastIp } });
    return;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const device = await prisma.knownDevice.create({ data: { userId, tokenHash: sha256(token), label: deviceLabel(incoming.get("user-agent")), lastIp } });
  const stale = await prisma.knownDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" }, skip: DEVICES_KEPT, select: { id: true } });
  if (stale.length) await prisma.knownDevice.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DEVICE_MAX_AGE_SECONDS });
  await enqueueOutbox(prisma, "login-alert", { userId, deviceId: device.id });
}
