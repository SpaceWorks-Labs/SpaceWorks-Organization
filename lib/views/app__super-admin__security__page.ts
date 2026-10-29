import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { DAY_MS, SECURITY_AUDIT_ACTIONS } from "@/lib/superAdminInsights";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
import { listBlockedIps } from "@/lib/ipBlock";
const ACTION_WINDOW_DAYS = 7;

export async function loadSuperAdminSecurityView() {
  await requireSuperAdmin();
  const now = new Date();
  const actionSince = new Date(now.getTime() - ACTION_WINDOW_DAYS * DAY_MS);
  // Every staff role needs an authenticator before the dashboard opens.
  const managerWhere = { teamMembers: { some: {} } };
  const [
    users,
    mfaUsers,
    unverifiedUsers,
    passwordUsers,
    managers,
    managersWithoutMfa,
    providerGroups,
    activeSessions,
    actionCounts,
    recentSecurityEvents,
    platformAdmins,
    blockedAddresses,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { mfaEnabledAt: { not: null } } }),
    prisma.user.count({ where: { emailVerified: null } }),
    prisma.user.count({ where: { passwordHash: { not: null } } }),
    prisma.user.count({ where: managerWhere }),
    prisma.user.count({ where: { ...managerWhere, mfaEnabledAt: null } }),
    prisma.account.groupBy({ by: ["provider"], _count: { _all: true } }),
    prisma.session.count({ where: { expires: { gt: now } } }),
    prisma.auditEvent.groupBy({
      by: ["action"],
      where: { action: { in: [...SECURITY_AUDIT_ACTIONS] }, createdAt: { gte: actionSince } },
      _count: { _all: true },
    }),
    prisma.auditEvent.findMany({
      where: { action: { in: [...SECURITY_AUDIT_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: auditRowSelect,
    }),
    prisma.user.findMany({
      where: { isSuperAdmin: true },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, name: true, email: true, mfaEnabledAt: true, emailVerified: true },
    }),
    listBlockedIps().catch(() => []),
  ]);
  const sortedActions = [...actionCounts].sort((a, b) => b._count._all - a._count._all);
  return { mfaUsers, users, managersWithoutMfa, managers, unverifiedUsers, passwordUsers, providerGroups, activeSessions, sortedActions, recentSecurityEvents, platformAdmins, blockedAddresses };
}
