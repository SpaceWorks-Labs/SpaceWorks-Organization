import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { codeHash, hashesMatch, phoneHash, type ParsedPhone } from "./phone";

/**
 * Phone codes (product rules section 15). Six digits, ten minutes, single use, at most five tries, stored only as a
 * keyed hash. Every request, for an account or not, leaves one `SmsCode` row; the limits count those rows, so a
 * number with no account is throttled exactly like one with an account and the answer never tells them apart.
 */
export type CodePurpose = "SIGN_IN" | "VERIFY";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60_000;
const NUMBER_LIMITS = [{ windowMs: 15 * 60_000, max: 3 }, { windowMs: DAY_MS, max: 10 }] as const;
const DEFAULT_COUNTRY_CAP = 500;

/** The most codes asked for numbers of one country calling code in a day, across the install. */
export function countryDailyCap(env: Record<string, string | undefined> = process.env) {
  const value = Number.parseInt(env.SMS_DAILY_COUNTRY_CAP ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_COUNTRY_CAP;
}

export type CodeRequest = { ok: true } | { ok: false; retryAfterSeconds: number };

const secondsUntil = (at: number, now: number) => Math.max(1, Math.ceil((at - now) / 1000));

/**
 * Record a request for a code for this number, and queue the text when `userId` names the account it belongs to
 * (null for a number nobody can sign in with: the row exists, nothing is sent). Refused with a wait when the number
 * or its country is over its limit.
 */
export async function requestSmsCode(input: { purpose: CodePurpose; phone: ParsedPhone; userId: string | null; now?: Date }): Promise<CodeRequest> {
  const now = input.now ?? new Date();
  const hash = phoneHash(input.phone.e164);
  const id = crypto.randomBytes(15).toString("base64url");
  const code = input.userId ? crypto.randomInt(0, 1_000_000).toString().padStart(6, "0") : null;
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  return prisma.$transaction(async (tx) => {
    // One request per number at a time, so a burst cannot slip past the count.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hash}))`;
    for (const { windowMs, max } of NUMBER_LIMITS) {
      const recent = await tx.smsCode.findMany({ where: { phoneHash: hash, createdAt: { gt: new Date(now.getTime() - windowMs) } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      if (recent.length >= max) return { ok: false as const, retryAfterSeconds: secondsUntil(recent[recent.length - max].createdAt.getTime() + windowMs, now.getTime()) };
    }
    const sentToCountry = await tx.smsCode.count({ where: { country: input.phone.country, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } });
    if (sentToCountry >= countryDailyCap()) return { ok: false as const, retryAfterSeconds: 3600 };
    // An earlier unused code for the same number and purpose stops working.
    await tx.smsCode.updateMany({ where: { phoneHash: hash, purpose: input.purpose, consumedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    await tx.smsCode.create({ data: { id, purpose: input.purpose, userId: input.userId, phoneHash: hash, country: input.phone.country, codeHash: code ? codeHash(id, code) : null, expiresAt: code ? expiresAt : now, createdAt: now } });
    if (code) await enqueueOutbox(tx, "sms-code", { codeId: id, to: input.phone.e164, code, expiresAt: expiresAt.toISOString() });
    return { ok: true as const };
  });
}

/** A fixed hash to compare against when no code row exists, so a missing row costs the same as a wrong code. */
const NO_ROW_HASH = crypto.createHash("sha256").update("swo:sms:no-row").digest("hex");

/**
 * Check a code against the newest live one for this number and purpose. Every check counts as an attempt (five per
 * code). With `consume`, a right code is used up; without, it stays for one more step (an authenticator code).
 * `userId` limits a verification code to the person who asked for it. Returns the account the code was issued to.
 */
export async function checkSmsCode(input: { purpose: CodePurpose; phone: ParsedPhone; code: string; consume: boolean; userId?: string; now?: Date }): Promise<{ ok: boolean; userId: string | null }> {
  const now = input.now ?? new Date();
  const typed = input.code.trim();
  const row = /^\d{6}$/.test(typed)
    ? await prisma.smsCode.findFirst({
        where: { phoneHash: phoneHash(input.phone.e164), purpose: input.purpose, consumedAt: null, expiresAt: { gt: now }, codeHash: { not: null }, ...(input.userId ? { userId: input.userId } : {}) },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (!row?.codeHash) {
    hashesMatch(codeHash("none", typed), NO_ROW_HASH);
    return { ok: false, userId: null };
  }
  const counted = await prisma.smsCode.updateMany({ where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1 || !hashesMatch(codeHash(row.id, typed), row.codeHash)) return { ok: false, userId: null };
  if (input.consume) {
    const used = await prisma.smsCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
    if (used.count !== 1) return { ok: false, userId: null };
  }
  return { ok: true, userId: row.userId };
}
