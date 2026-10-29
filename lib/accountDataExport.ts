import "server-only";

import { prisma } from "@/lib/db";
import { buildMembershipExport, loadMembershipExportSource, MEMBERSHIP_EXPORT_LIMIT, type MembershipExport } from "@/lib/portal/dataExport";

/**
 * Per-collection safety cap. A personal export is the user's own data, so the caps are generous;
 * `truncated` tells the reader when one was reached.
 */
export const ACCOUNT_EXPORT_LIMIT = 2000;

const ACCOUNT_EXPORT_FORMAT_VERSION = 3;

/* ---------- Raw input shapes (exactly what the loader selects) ---------- */

export type AccountExportSource = {
  user: {
    name: string | null;
    email: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    mfaEnabledAt: Date | null;
  };
  signInProviders: Array<{ provider: string }>;
  teamMembers: Array<{ orgRole: { name: string }; createdAt: Date; organisation: { name: string; slug: string } }>;
  /** Member records in each organisation, already allow-list shaped (lib/portal/dataExport.ts). */
  memberships?: MembershipExport;
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

/**
 * Shape the export with explicit allow-listed fields only. Never spread a source object: password
 * hashes, MFA seeds, recovery codes, OAuth tokens, session data and capability tokens must not reach
 * the file.
 */
export function buildAccountDataExport(source: AccountExportSource, generatedAt: Date = new Date()) {
  const cap = <T,>(list: T[]) => list.slice(0, ACCOUNT_EXPORT_LIMIT);
  return {
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    generatedAt: generatedAt.toISOString(),
    profile: {
      name: source.user.name,
      email: source.user.email,
      emailVerified: Boolean(source.user.emailVerified),
      emailVerifiedAt: iso(source.user.emailVerified),
      accountCreatedAt: source.user.createdAt.toISOString(),
      twoFactorAuthenticationEnabled: Boolean(source.user.mfaEnabledAt),
      linkedSignInProviders: [...new Set(source.signInProviders.map((account) => account.provider))].sort(),
    },
    organisationTeams: cap(source.teamMembers).map((team) => ({
      organisation: team.organisation.name,
      organisationSlug: team.organisation.slug,
      role: team.orgRole.name,
      joinedAt: team.createdAt.toISOString(),
    })),
    memberships: source.memberships ?? [],
    truncated: {
      organisationTeams: source.teamMembers.length > ACCOUNT_EXPORT_LIMIT,
      memberships: (source.memberships?.length ?? 0) >= MEMBERSHIP_EXPORT_LIMIT,
    },
  };
}

/**
 * Load only the signed-in user's own rows. Every query is keyed on `userId` and fetches one row beyond
 * the cap so truncation can be reported. Selects are explicit; no secret column is read.
 */
export async function loadAccountExportSource(userId: string): Promise<AccountExportSource | null> {
  const take = ACCOUNT_EXPORT_LIMIT + 1;
  const [user, signInProviders, teamMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, emailVerified: true, createdAt: true, mfaEnabledAt: true },
    }),
    prisma.account.findMany({ where: { userId }, select: { provider: true }, take: 20 }),
    prisma.teamMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take,
      select: { orgRole: { select: { name: true } }, createdAt: true, organisation: { select: { name: true, slug: true } } },
    }),
  ]);
  if (!user) return null;
  // Member records are matched by verified email only, the same rule as the member portal.
  const memberships = user.email && user.emailVerified ? buildMembershipExport(await loadMembershipExportSource(user.email)) : [];
  return { user, signInProviders, teamMembers, memberships };
}
