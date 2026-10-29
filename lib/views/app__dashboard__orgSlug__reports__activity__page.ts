import { prisma } from "@/lib/db";
import { inSubtree } from "@/lib/reports/dataset";
import { bucketIndex, periodBuckets } from "@/lib/reports/period";
import { activityCategory, ACTIVITY_CATEGORIES } from "@/lib/reports/activity";
import { loadCardIssuance } from "@/lib/reports/cards";
import { openReport, reportShell } from "@/lib/reports/shell";
import type { ReportSearch } from "@/lib/reports/context";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

/**
 * B12 manager activity from the audit trail: who did what, by category, over the period. A manager
 * limited to a unit sees the team members inside their own subtree only. B11 card issuance joins here
 * once P6 provides it (lib/reports/cards.ts).
 */
export async function loadOrgReportsActivity({ params, searchParams }: Props) {
  const ctx = await openReport(params, searchParams, "audit.view");
  const { now, period, org, team } = ctx;
  const teamMembers = await prisma.teamMember.findMany({ where: { organisationId: org.id }, select: { userId: true, orgRole: { select: { name: true } }, unitId: true, user: { select: { name: true, email: true } } } });
  const unitPath = new Map(ctx.allUnits.map((unit) => [unit.id, unit.path]));
  const visible = teamMembers.filter((member) => !team.unitPath || member.userId === ctx.userId || (member.unitId && inSubtree(unitPath.get(member.unitId) ?? null, team.unitPath)));
  // Platform super admins who came in through platform access (owner decision 2026-10-29) show to org-wide viewers.
  if (!team.unitPath) {
    const entered = await prisma.auditEvent.groupBy({ by: ["actorUserId"], where: { organisationId: org.id, action: { startsWith: "SUPER_ADMIN_ORG_" }, createdAt: { gte: period.from, lt: period.to } } });
    const ids = entered.map((row) => row.actorUserId).filter((id): id is string => Boolean(id) && !teamMembers.some((member) => member.userId === id));
    const admins = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, isSuperAdmin: true }, select: { id: true, name: true, email: true } }) : [];
    for (const admin of admins) visible.push({ userId: admin.id, orgRole: { name: "Platform super admin" }, unitId: null, user: { name: admin.name, email: admin.email } });
  }
  const actorIds = visible.map((member) => member.userId);
  const events = await prisma.auditEvent.findMany({
    where: { organisationId: org.id, actorUserId: { in: actorIds }, createdAt: { gte: period.from, lt: period.to } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { id: true, action: true, actorUserId: true, createdAt: true, targetType: true },
  });
  const buckets = periodBuckets(period, org.timezone).filter((bucket) => bucket.from <= now);
  const perBucket = buckets.map(() => 0);
  const byActor = new Map<string, Record<string, number>>();
  for (const event of events) {
    const index = bucketIndex(buckets, event.createdAt);
    if (index >= 0) perBucket[index] += 1;
    const counts = byActor.get(event.actorUserId!) ?? {};
    const category = activityCategory(event.action);
    counts[category] = (counts[category] ?? 0) + 1;
    byActor.set(event.actorUserId!, counts);
  }
  const nameOf = new Map(visible.map((member) => [member.userId, member.user.name ?? member.user.email ?? "Team member"]));
  return {
    shell: reportShell(ctx, "activity"),
    total: events.length,
    capped: events.length === 5000,
    series: buckets.map((bucket, index) => ({ label: bucket.label, count: perBucket[index] })),
    categories: ACTIVITY_CATEGORIES.map((category) => ({ key: category.key, label: category.label })),
    people: visible
      .map((member) => ({ userId: member.userId, name: nameOf.get(member.userId)!, roleName: member.orgRole.name, counts: byActor.get(member.userId) ?? {}, total: Object.values(byActor.get(member.userId) ?? {}).reduce((sum, n) => sum + n, 0) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    recent: events.slice(0, 50).map((event) => ({ id: event.id, when: event.createdAt, who: nameOf.get(event.actorUserId!) ?? "Team member", what: activityCategory(event.action), action: event.action })),
    cards: await loadCardIssuance(ctx.scope, period),
  };
}

export type OrgReportsActivity = Awaited<ReturnType<typeof loadOrgReportsActivity>>;
