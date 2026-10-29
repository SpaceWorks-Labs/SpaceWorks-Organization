import "server-only";

import { prisma } from "@/lib/db";

/**
 * How the portal finds a person's own member records: by the signed-in account's VERIFIED email,
 * lowercased, matched to Member.email. Never by a member id alone, so nobody can reach another
 * person's record by guessing ids. Anonymised records no longer match.
 */

/** Organisations whose members can still see their records (history stays after a suspension or closure). */
export const PORTAL_ORGANISATION_STATUSES = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;

export async function verifiedEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return null;
  return user.email.trim().toLowerCase();
}

export type OwnMember = NonNullable<Awaited<ReturnType<typeof findOwnMember>>>;

/** The signed-in person's member record in one organisation, or null (callers answer 404). */
export async function findOwnMember(userId: string, organisationSlug: string) {
  const email = await verifiedEmail(userId);
  if (!email) return null;
  const member = await prisma.member.findFirst({
    where: {
      email,
      anonymisedAt: null,
      organisation: { slug: organisationSlug, status: { in: [...PORTAL_ORGANISATION_STATUSES] }, memberPortal: true },
    },
    include: {
      organisation: { select: { id: true, slug: true, name: true, status: true, timezone: true, financialYearStartMonth: true, locale: true, logoUrl: true, accentColor: true, unitLevels: true, memberPhotoUpload: true } },
    },
  });
  if (!member) return null;
  // Link the record to the account the first time the person shows up, so managers see it is claimed.
  if (!member.userId) await prisma.member.updateMany({ where: { id: member.id, userId: null }, data: { userId } });
  return { ...member, email };
}
