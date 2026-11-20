import "server-only";

import crypto from "crypto";
import * as OTPAuth from "otpauth";
import { prisma } from "@/lib/db";
import { openEnvelope, parseBase64Key, sealEnvelope } from "@/lib/crypto/envelope";

const ISSUER = "Space Works Organization";

function encryptionKey() {
  const key = parseBase64Key(process.env.MFA_ENCRYPTION_KEY ?? "");
  if (!key) throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  return key;
}

export function encryptMfaSecret(secret: string) {
  return sealEnvelope(secret, encryptionKey());
}

export function decryptMfaSecret(value: string) {
  return openEnvelope(value, encryptionKey(), "Invalid encrypted MFA secret.");
}

function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function createMfaEnrollment(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  return { secret, uri: totp(secret, email).toString() };
}

export function verifyMfaCode(secret: string, email: string, input: string) {
  const token = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(token) && totp(secret, email).validate({ token, window: 1 }) !== null;
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const value = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
  });
}

export function hashRecoveryCode(code: string) {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "").update(normalized).digest("hex");
}

/**
 * Atomically consume one recovery-code hash. Performing array removal inside
 * PostgreSQL prevents concurrent sign-ins from accepting the same code or
 * reintroducing a code through a stale read/replace update.
 */
export async function consumeRecoveryCode(userId: string, code: string) {
  const recoveryHash = hashRecoveryCode(code);
  const consumed = await prisma.$executeRaw`
    UPDATE "User"
    SET "recoveryCodeHashes" = array_remove("recoveryCodeHashes", ${recoveryHash})
    WHERE "id" = ${userId}
      AND ${recoveryHash} = ANY("recoveryCodeHashes")
  `;
  return consumed === 1;
}

/** A database uniqueness constraint rejects replay across workers and replicas. */
export async function consumeMfaCode(secret: string, email: string, input: string) {
  const token = input.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const now = Date.now();
  const delta = totp(secret, email).validate({ token, window: 1, timestamp: now });
  if (delta === null) return false;
  const step = Math.floor(now / 30_000) + delta;
  // Never persist the code or seed. Bind the claim to this seed and time step.
  const digest = crypto.createHmac("sha256", encryptionKey()).update(`totp-use:${secret}:${step}`).digest("hex");
  const claimed = await prisma.verificationToken.createMany({
    data: { identifier: "mfa-replay", token: digest, expires: new Date((step + 2) * 30_000) },
    skipDuplicates: true,
  });
  return claimed.count === 1;
}
