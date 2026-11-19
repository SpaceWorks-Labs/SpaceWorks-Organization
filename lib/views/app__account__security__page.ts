import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { SECURITY_ACTIVITY_ACTIONS, SECURITY_ACTIVITY_LIMIT, signInProviderLabel } from "@/lib/accountSecurity";
import { listUserSessions } from "@/lib/userSessions";
import { listLinkableMethods, linkedProviderLabels } from "@/lib/authMethods/linkable";
import { countWorkingMethods, providerAvailable } from "@/lib/authMethods/workingMethods";

export async function loadAccountSecurityView() {
  const session = await requireAuth();
  const userId = session.user.id;
  const sid = (session as { sid?: string }).sid;
  const [user, accounts, activity, staffRoles] = await Promise.all([
    // passwordHash is read only to derive a boolean; it never reaches the browser.
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true, passwordHash: true, isSuperAdmin: true, sessionVersion: true, recoveryCodeHashes: true } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, provider: true }, orderBy: { provider: "asc" } }),
    // The person's own security events only; metadata is never selected.
    prisma.auditEvent.findMany({
      where: { actorUserId: userId, action: { in: SECURITY_ACTIVITY_ACTIONS } },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: SECURITY_ACTIVITY_LIMIT,
    }),
    prisma.teamMember.count({ where: { userId } }),
  ]);
  const hasPassword = Boolean(user.passwordHash);
  const [sessions, { names, context }, linkable, working] = await Promise.all([
    listUserSessions(userId, user.sessionVersion, sid),
    linkedProviderLabels(),
    user.isSuperAdmin ? Promise.resolve([]) : listLinkableMethods(),
    countWorkingMethods(userId),
  ]);
  // One row per linked identity. Super admins sign in with their password only, so nothing is offered to link for them.
  const linked = accounts.map((account) => ({
    id: account.id, provider: account.provider, label: names.get(account.provider) ?? signInProviderLabel(account.provider),
    available: providerAvailable(account.provider, context),
    // Whether removing it is allowed is decided again on the server; this only greys the button out.
    canRemove: !providerAvailable(account.provider, context) || working > 1,
  }));
  const linkedProviders = new Set(accounts.map((account) => account.provider));
  // Staff must use an authenticator app before the dashboard opens; members never need one.
  const authenticatorRequired = staffRoles > 0 && !user.mfaEnabledAt;
  return {
    hasPassword, superAdmin: user.isSuperAdmin, authenticatorRequired, isStaff: staffRoles > 0,
    user: { mfaEnabledAt: user.mfaEnabledAt }, recoveryCodesLeft: user.recoveryCodeHashes.length, activity,
    sessions, linked, linkable: linkable.filter((method) => !linkedProviders.has(method.provider)),
  };
}
