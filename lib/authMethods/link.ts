import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditIdentityLinked } from "@/lib/authAudit";

/** Why an identity may not be added to a signed-in account; every code is also a message on the security page. */
export type LinkRefusal = "super_admin_password_only" | "identity_linked_elsewhere" | "link_failed";

/**
 * The rules for adding an outside identity to the signed-in user (never by email): super admins sign in with their
 * password only, and an identity already linked to another account is never moved. Already linked to this user is fine.
 */
export async function linkRefusal(userId: string, provider: string, providerAccountId: string): Promise<LinkRefusal | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!user) return "link_failed";
  if (user.isSuperAdmin) return "super_admin_password_only";
  const existing = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, select: { userId: true } });
  return existing && existing.userId !== userId ? "identity_linked_elsewhere" : null;
}

const select = { id: true, name: true, email: true, image: true, sessionVersion: true } as const;

/**
 * Link a verified identity from a Credentials-type method (SAML, the Supabase and Firebase bridges) to the user whose
 * live session asked for it, and return that user for the new token. The caller has already checked the identity's proof.
 */
export async function linkExternalIdentity(userId: string, provider: string, type: string, sub: string): Promise<{ ok: true; user: Prisma.UserGetPayload<{ select: typeof select }> } | { ok: false; code: LinkRefusal }> {
  const refusal = await linkRefusal(userId, provider, sub);
  if (refusal) return { ok: false, code: refusal };
  const user = await prisma.user.findUnique({ where: { id: userId }, select });
  if (!user) return { ok: false, code: "link_failed" };
  const existing = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: sub } }, select: { id: true } });
  if (!existing) {
    try {
      await prisma.account.create({ data: { userId, type, provider, providerAccountId: sub } });
      await auditIdentityLinked(userId, provider);
    } catch (error) {
      // The same identity linked twice at once: whichever won must be this user's, else it is someone else's.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const winner = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: sub } }, select: { userId: true } });
      if (winner?.userId !== userId) return { ok: false, code: "identity_linked_elsewhere" };
    }
  }
  return { ok: true, user };
}
