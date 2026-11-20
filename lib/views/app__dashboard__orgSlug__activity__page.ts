import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { addDays, startOfLocalDay, type CalendarDate } from "@/lib/membership/periods";
import { loadActivityLog } from "@/lib/audit/log";
import { targetHref } from "@/lib/audit/targets";
import { ACTIVITY_CATEGORIES, isMemberInitiatedAction } from "@/lib/reports/activity";

type Search = { actor?: string; category?: string; member?: string; from?: string; to?: string; cursor?: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function day(text: string | undefined): CalendarDate | null {
  const match = DAY.exec(text ?? "");
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return check.getUTCFullYear() === date.year && check.getUTCMonth() === date.month - 1 && check.getUTCDate() === date.day ? date : null;
}

/**
 * Organisation activity: the audit trail for this organisation (team, member and system events), 50 to a page, with
 * filters for who, what kind, which member and when. Staff limited to units or groupings see only events about
 * members inside their reach.
 */
export async function loadOrgActivity({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Search> }) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "audit.view");
  const scope = await teamScope(organisation.id, membership);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, timezone: true } });
  const from = day(search.from);
  const to = day(search.to);
  const actor = search.actor && (search.actor === "members" || search.actor === "system" || ID.test(search.actor)) ? search.actor : undefined;
  const category = ACTIVITY_CATEGORIES.some((entry) => entry.key === search.category) ? search.category : undefined;
  const memberId = search.member && ID.test(search.member) ? search.member : undefined;

  const [page, team] = await Promise.all([
    loadActivityLog(organisation.id, scope, {
      actor, category, memberId, cursor: search.cursor?.slice(0, 80),
      from: from ? startOfLocalDay(from, org.timezone) : undefined,
      to: to ? startOfLocalDay(addDays(to, 1), org.timezone) : undefined,
    }),
    prisma.teamMember.findMany({ where: { organisationId: organisation.id }, select: { userId: true, orgRole: { select: { name: true } }, user: { select: { name: true, email: true } } } }),
  ]);
  const showNames = can(membership, "members.view");
  const teamByUser = new Map(team.map((row) => [row.userId, row]));
  const actorIds = [...new Set(page.events.map((event) => event.actorUserId).filter((id): id is string => Boolean(id)))];
  const memberIds = [...new Set(page.events.map((event) => event.memberId).filter((id): id is string => Boolean(id)))];
  const [users, members, filterMember] = await Promise.all([
    actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, isSuperAdmin: true } }) : [],
    showNames && memberIds.length ? prisma.member.findMany({ where: { organisationId: organisation.id, id: { in: memberIds } }, select: { id: true, name: true } }) : [],
    showNames && memberId ? prisma.member.findFirst({ where: { organisationId: organisation.id, id: memberId }, select: { name: true } }) : null,
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const memberName = new Map(members.map((member) => [member.id, member.name]));

  const rows = page.events.map((event) => {
    const staff = event.actorUserId ? teamByUser.get(event.actorUserId) : null;
    const user = event.actorUserId ? userById.get(event.actorUserId) : null;
    const who = !event.actorUserId ? "System" : staff ? staff.user.name ?? staff.user.email ?? "Team member" : user?.isSuperAdmin ? "Platform super admin" : showNames ? user?.name ?? "A member" : "A member";
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? (event.metadata as Record<string, unknown>) : null;
    return {
      id: event.id, when: event.createdAt, action: event.action, category: event.category, who,
      memberInitiated: isMemberInitiatedAction(event.action) || (!staff && Boolean(event.actorUserId) && !user?.isSuperAdmin),
      subject: event.memberId ? { name: memberName.get(event.memberId) ?? "A member", href: `/dashboard/${org.slug}/members/${event.memberId}` } : null,
      targetType: event.targetType,
      href: targetHref(org.slug, event.targetType, event.targetId, { ...metadata, ...(event.memberId ? { memberId: event.memberId } : {}) }),
    };
  });

  return {
    org,
    timeZone: org.timezone,
    limited: Boolean(scope.unitPath) || scope.limits.length > 0,
    rows,
    next: page.next,
    selected: { actor: actor ?? "", category: category ?? "", from: from ? search.from! : "", to: to ? search.to! : "", member: memberId ?? "" },
    filterMemberName: filterMember?.name ?? (memberId ? "This member" : null),
    paged: Boolean(search.cursor),
    filtered: Boolean(actor || category || from || to || memberId),
    categories: ACTIVITY_CATEGORIES.map((entry) => ({ key: entry.key, label: entry.label })),
    actors: [
      ...team.map((row) => ({ id: row.userId, label: `${row.user.name ?? row.user.email ?? "Team member"} (${row.orgRole.name})` })).sort((a, b) => a.label.localeCompare(b.label)),
      { id: "members", label: "Members" },
      { id: "system", label: "System" },
    ],
  };
}

export type OrgActivityView = Awaited<ReturnType<typeof loadOrgActivity>>;
