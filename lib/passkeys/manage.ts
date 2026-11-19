import "server-only";

import { generateRegistrationOptions, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { deviceLabel } from "@/lib/loginSecurity";
import type { loadLoginMethods } from "@/lib/loginMethods";
import { countWorkingMethods } from "@/lib/authMethods/workingMethods";
import { PASSKEYS_PER_USER, passkeyRelyingParty } from "./config";
import { consumeChallenge, discardChallenge, peekChallenge, registrationKey, saveChallenge } from "./challenges";
import { verifyRegistration } from "./verify";

export type PasskeyResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const FULL = `You can register up to ${PASSKEYS_PER_USER} passkeys. Remove one first.`;
const EXPIRED = "That took too long. Try adding the passkey again.";

/** Options for navigator.credentials.create: user verification required, discoverable credential preferred. */
export async function beginRegistration(user: { id: string; email: string; name: string | null }) {
  const existing = await prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  if (existing.length >= PASSKEYS_PER_USER) return { ok: false as const, error: FULL };
  const { rpID, rpName } = passkeyRelyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({ id: row.credentialId, transports: row.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await saveChallenge(registrationKey(user.id), "register", options.challenge);
  return { ok: true as const, data: options };
}

/** Verify the response against this person's challenge (used once) and store the credential, audited. */
export async function finishRegistration(userId: string, response: RegistrationResponseJSON, userAgent: string | null): Promise<PasskeyResult<{ id: string }>> {
  const key = registrationKey(userId);
  const challenge = await peekChallenge(key, "register");
  if (!challenge) return { ok: false, error: EXPIRED };
  const verified = await verifyRegistration(response, challenge);
  if (!verified.ok) {
    await discardChallenge(key);
    return { ok: false, error: "That passkey could not be verified. Try again." };
  }
  if (!(await consumeChallenge(key))) return { ok: false, error: EXPIRED };
  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if ((await tx.passkey.count({ where: { userId } })) >= PASSKEYS_PER_USER) return null;
      const created = await tx.passkey.create({
        data: {
          userId,
          credentialId: verified.credential.id,
          publicKey: Buffer.from(verified.credential.publicKey),
          counter: BigInt(verified.credential.counter),
          transports: verified.credential.transports ?? [],
          deviceType: verified.deviceType,
          backedUp: verified.backedUp,
          name: deviceLabel(userAgent).slice(0, 60),
        },
        select: { id: true },
      });
      await recordAuditEvent({ action: "PASSKEY_ADDED", actorUserId: userId, targetType: "Passkey", targetId: created.id, client: tx });
      return created;
    });
    return row ? { ok: true, data: { id: row.id } } : { ok: false, error: FULL };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "That passkey is already registered." };
    throw error;
  }
}

/** Rename one of this person's own passkeys. */
export async function renamePasskey(userId: string, id: string, name: string): Promise<PasskeyResult> {
  const updated = await prisma.passkey.updateMany({ where: { id, userId }, data: { name } });
  return updated.count === 1 ? { ok: true } : { ok: false, error: "That passkey no longer exists." };
}

/**
 * Remove one of this person's own passkeys, audited. While passkeys are available, the last working way to sign in
 * cannot be removed: the person needs a password, a linked account or another passkey left.
 */
export async function removePasskey(userId: string, id: string, login: Awaited<ReturnType<typeof loadLoginMethods>>): Promise<PasskeyResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const target = await tx.passkey.findFirst({ where: { id, userId }, select: { id: true } });
    if (!target) return { ok: false as const, error: "That passkey no longer exists." };
    // Nothing is lost when passkeys are off (they do not count then); otherwise some other method must remain.
    if (login.available.includes("passkey") && (await countWorkingMethods(userId, { passkeyId: id }, tx, login)) === 0) {
      return { ok: false as const, error: "This is your only way to sign in. Add a password or another sign-in method first." };
    }
    await tx.passkey.delete({ where: { id } });
    await recordAuditEvent({ action: "PASSKEY_REMOVED", actorUserId: userId, targetType: "Passkey", targetId: id, client: tx });
    return { ok: true as const };
  });
}
