import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptOrgSecret, encryptOrgSecret } from "@/lib/orgSecrets";
import type { ConfigurableChannel } from "@/lib/messages/kinds";
import { safeEqual } from "./verify";

/**
 * Personal endpoints: a person's verified address on a channel (a chat user id, or a phone number), in the scope of
 * the connection that reaches it (an organisation's own bot, or the platform's: scope null). An address is stored
 * encrypted, with a keyed digest for uniqueness; a one-time code proves the person holds both the account and the address.
 */
export const CODE_TTL_MS = 15 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
const STARTS_PER_HOUR = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function key(purpose: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for messaging.");
  return crypto.createHmac("sha256", secret).update(`swo:messaging:${purpose}`).digest();
}

const hmac = (purpose: string, value: string) => crypto.createHmac("sha256", key(purpose)).update(value).digest("hex");
export const identityDigest = (channel: string, identity: string) => hmac("identity", `${channel}:${identity}`);
const scopeId = (scopeOrgId: string | null) => scopeOrgId ?? "platform";
export const sealIdentity = (identity: string, scopeOrgId: string | null) => encryptOrgSecret(identity, scopeId(scopeOrgId), "messaging");
export const openIdentity = (sealed: string, scopeOrgId: string | null) => decryptOrgSecret(sealed, scopeId(scopeOrgId), "messaging");

const randomChars = (length: number) => Array.from(crypto.randomBytes(length), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
const codeHash = (id: string, secret: string) => hmac("challenge", `${id}:${secret}`);

/** "ABCD2345-XY7Z4Q" typed, pasted or carried by a deep link ("_" instead of "-"), in any case and spacing. */
export function parseCode(input: unknown): { id: string; secret: string } | null {
  if (typeof input !== "string" || input.length > 60) return null;
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z2-9]{14}$/.test(clean) ? { id: clean.slice(0, 8), secret: clean.slice(8) } : null;
}

export type Started = { ok: true; code: string; expiresAt: Date } | { ok: false; error: string };

/** A new one-time code for this person, scope and channel; the earlier unused one stops working. At most six an hour. */
export async function startChallenge(input: { userId: string; scopeOrgId: string | null; channel: ConfigurableChannel; now?: Date }): Promise<Started> {
  const now = input.now ?? new Date();
  const recent = await prisma.notificationEndpointChallenge.count({ where: { userId: input.userId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
  if (recent >= STARTS_PER_HOUR) return { ok: false, error: "You have asked for several codes. Try again in an hour." };
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomChars(8);
    const secret = randomChars(6);
    try {
      await prisma.$transaction([
        prisma.notificationEndpointChallenge.updateMany({ where: { userId: input.userId, organisationId: input.scopeOrgId, channel: input.channel, consumedAt: null }, data: { expiresAt: now } }),
        prisma.notificationEndpointChallenge.create({ data: { id, userId: input.userId, organisationId: input.scopeOrgId, channel: input.channel, codeHash: codeHash(id, secret), expiresAt, createdAt: now } }),
      ]);
      return { ok: true, code: `${id}-${secret}`, expiresAt };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { ok: false, error: "A code could not be made. Try again." };
}

export type Linked = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "locked" | "taken" };

/**
 * A webhook received a code from a chat user. Every presentation counts as an attempt on that code (five at most),
 * so guessing the secret half is hopeless; a wrong secret, an unknown id, a code for another scope or channel, and
 * one already used all answer the same way.
 */
export async function completeChallenge(input: { code: unknown; scopeOrgId: string | null; channel: ConfigurableChannel; identity: string; now?: Date }): Promise<Linked> {
  const now = input.now ?? new Date();
  const parsed = parseCode(input.code);
  if (!parsed) return { ok: false, reason: "invalid" };
  const row = await prisma.notificationEndpointChallenge.findFirst({ where: { id: parsed.id, organisationId: input.scopeOrgId, channel: input.channel, consumedAt: null } });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  const counted = await prisma.notificationEndpointChallenge.updateMany({ where: { id: row.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1) return { ok: false, reason: "locked" };
  if (!safeEqual(codeHash(row.id, parsed.secret), row.codeHash)) return { ok: false, reason: "invalid" };
  const used = await prisma.notificationEndpointChallenge.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (used.count !== 1) return { ok: false, reason: "invalid" };
  const linked = await linkEndpoint({ userId: row.userId, scopeOrgId: input.scopeOrgId, channel: input.channel, identity: input.identity, now });
  return linked ? { ok: true, userId: row.userId } : { ok: false, reason: "taken" };
}

/** Save an address for a person, replacing their earlier one in this scope and channel. False when another person holds it. */
export async function linkEndpoint(input: { userId: string; scopeOrgId: string | null; channel: ConfigurableChannel; identity: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.notificationEndpoint.updateMany({ where: { userId: input.userId, organisationId: input.scopeOrgId, channel: input.channel, revokedAt: null }, data: { revokedAt: now } });
      await tx.notificationEndpoint.create({ data: { userId: input.userId, organisationId: input.scopeOrgId, channel: input.channel, identityDigest: identityDigest(input.channel, input.identity), identityEncrypted: sealIdentity(input.identity, input.scopeOrgId), verifiedAt: now } });
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

/** The person's live address on a channel in a scope, decrypted for sending; null when none. */
export async function liveIdentity(userId: string, scopeOrgId: string | null, channel: ConfigurableChannel): Promise<string | null> {
  const row = await prisma.notificationEndpoint.findFirst({ where: { userId, organisationId: scopeOrgId, channel, revokedAt: null }, select: { identityEncrypted: true } });
  return row ? openIdentity(row.identityEncrypted, scopeOrgId) : null;
}

/** Unlink the person's address on a channel in a scope. */
export async function revokeEndpoint(userId: string, scopeOrgId: string | null, channel: ConfigurableChannel, now = new Date()) {
  const { count } = await prisma.notificationEndpoint.updateMany({ where: { userId, organisationId: scopeOrgId, channel, revokedAt: null }, data: { revokedAt: now } });
  return count;
}

/** Who holds an address in a scope (a reply or a webhook names only the address). */
export async function userForIdentity(scopeOrgId: string | null, channel: ConfigurableChannel, identity: string): Promise<string | null> {
  const row = await prisma.notificationEndpoint.findFirst({ where: { organisationId: scopeOrgId, channel, identityDigest: identityDigest(channel, identity), revokedAt: null }, select: { userId: true } });
  return row?.userId ?? null;
}
