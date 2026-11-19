import "server-only";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueEmailVerification } from "@/lib/outbox";
import { inviteReturnPath } from "@/lib/inviteLink";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function identifierFor(userId: string) {
  return `email-verification:${userId}`;
}

function verificationUrl(token: string, returnPath?: string) {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const next = inviteReturnPath(returnPath);
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}

/** `returnPath` (a staff invite page) is carried in the link so confirming brings the person back to it. */
export async function issueEmailVerification(user: { id: string; email: string }, client: Prisma.TransactionClient = prisma, returnPath?: string) {
  await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);
  await client.verificationToken.deleteMany({ where: { identifier: identifierFor(user.id) } });
  await client.verificationToken.create({
    data: { identifier: identifierFor(user.id), token: hashToken(rawToken), expires },
  });
  await enqueueEmailVerification(client, {
    to: user.email,
    verificationUrl: verificationUrl(rawToken, returnPath),
    expiresAt: expires.toISOString(),
  });
}

export async function verifyEmail(token: string) {
  const tokenHash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const verification = await tx.verificationToken.findUnique({
      where: { token: tokenHash },
      select: { identifier: true, expires: true },
    });
    if (!verification || !verification.identifier.startsWith("email-verification:") || verification.expires <= new Date()) return false;

    const userId = verification.identifier.slice("email-verification:".length);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const consumed = await tx.verificationToken.deleteMany({
      where: { identifier: verification.identifier, token: tokenHash, expires: { gt: new Date() } },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    await tx.verificationToken.deleteMany({ where: { identifier: verification.identifier } });
    return true;
  });
}
