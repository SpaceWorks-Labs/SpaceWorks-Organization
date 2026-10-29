import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { canGrant, roleCapabilities, STARTER_ROLES } from "@/lib/permissionRoles";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { mayGrant } from "@/lib/team/granting";
import { openTransferWhere } from "@/lib/team/ownership";
import { formatRelativeTime } from "@/lib/format/datetime";
import { firstName, grantLabel, type RoleCount, type TeamMemberRow, type TeamRoleOption } from "@/components/team/memberSummary";
type Props = { params: Promise<{ orgSlug: string; }>; searchParams: Promise<{ page?: string; }>; };
const MEMBERS_PAGE_SIZE = 100;
const RECENT_DAYS = 30;
const DISPLAY_TIME_ZONE = "UTC";
const joinedFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: DISPLAY_TIME_ZONE });
const expiryFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE });

export async function loadOrgMembersView({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const requestedPage = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.view");
  const adminView = can(membership, "team.manage", { write: true });
  const canGrantOrgWide = adminView && !membership.unitId;
  const h = await headers();
  const now = new Date();
  const recentSince = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const where = { organisationId: organisation.id };
  const scope = await teamScope(organisation.id, membership.unitId);
  const [profile, memberCount, roleGroups, recentCount, latestJoiner, roles] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { logoUrl: true, unitLevels: true } }),
    prisma.teamMember.count({ where }),
    prisma.teamMember.groupBy({ by: ["roleId"], where, _count: { _all: true } }),
    prisma.teamMember.count({ where: { ...where, createdAt: { gte: recentSince } } }),
    prisma.teamMember.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { userId: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.orgRole.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, isOwner: true, capabilities: true, archivedAt: true } }),
  ]);
  const memberPages = Math.max(1, Math.ceil(memberCount / MEMBERS_PAGE_SIZE));
  const memberPage = Math.min(requestedPage, memberPages);
  const members = await prisma.teamMember.findMany({
    where,
    select: {
      id: true, userId: true, roleId: true, unitId: true, createdAt: true,
      orgRole: { select: { name: true, isOwner: true, capabilities: true } },
      unit: { select: { name: true, path: true } },
      user: { select: { name: true, email: adminView } },
    },
    orderBy: { createdAt: "asc" },
    skip: (memberPage - 1) * MEMBERS_PAGE_SIZE,
    take: MEMBERS_PAGE_SIZE,
  });
  // Only invites this viewer could give (inside their reach, roles they may grant), filtered before the limit so
  // newer invites from other units never crowd theirs out; the count is of the same set.
  const grantable = (scoped: boolean) => roles.filter((role) => canGrant(membership, role, scoped)).map((role) => role.id);
  const reach = scope.unitPath ? { unit: { is: { OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] } } } : {};
  const openInviteWhere: Prisma.TeamInviteWhereInput = {
    organisationId: organisation.id,
    usedAt: null,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [...(membership.unitId ? [] : [{ unitId: null, roleId: { in: grantable(false) } }]), { unitId: { not: null }, roleId: { in: grantable(true) }, ...reach }] },
    ],
  };
  const [invites, openInviteCount] = adminView
    ? await Promise.all([
      prisma.teamInvite.findMany({
        where: openInviteWhere,
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, token: true, createdAt: true, unitId: true, orgRole: { select: { name: true, isOwner: true, capabilities: true } }, unit: { select: { name: true, path: true } } },
      }),
      prisma.teamInvite.count({ where: openInviteWhere }),
    ])
    : [[], 0];
  // Units the viewer may give access to: their own subtree, when the organisation uses units.
  const units = adminView && profile.unitLevels.length
    ? (await prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } }))
      .filter((unit) => unitInScope(scope, unit.path))
      .map(({ id, name, level }) => ({ id, name, level }))
    : [];
  const roleOptions: TeamRoleOption[] = adminView
    ? roles
      .filter((role) => !role.archivedAt && !role.isOwner)
      .map((role) => ({ id: role.id, name: role.name, orgWide: canGrantOrgWide && canGrant(membership, role, false), scoped: canGrant(membership, role, true), permissions: roleCapabilities(role).size }))
      .filter((role) => role.orgWide || role.scoped)
    : [];
  const baseUrl: string =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (() => {
      const proto = h.get("x-forwarded-proto") ?? "http";
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
      return `${proto}://${host}`;
    })();
  const holders = new Map(roleGroups.map((group) => [group.roleId, group._count._all]));
  const roleCounts: RoleCount[] = roles.map((role) => ({ id: role.id, name: role.name, isOwner: role.isOwner, count: holders.get(role.id) ?? 0 }));
  const latestName =
    latestJoiner == null
      ? null
      : latestJoiner.userId === membership.userId
        ? "you"
        : (firstName(latestJoiner.user.name) ?? "someone new");
  const recentHint = latestJoiner
    ? `Latest: ${latestName}, ${formatRelativeTime(latestJoiner.createdAt, DISPLAY_TIME_ZONE, now).replace(/^(Just now|Yesterday)$/, (word) => word.toLowerCase())}`
    : "No one has joined yet";
  const rows: TeamMemberRow[] = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    // Staff limited to a unit see the emails of staff inside their reach only.
    ...(adminView && unitInScope(scope, m.unit?.path ?? null) ? { email: m.user.email ?? null } : {}),
    roleId: m.roleId,
    roleName: m.orgRole.name,
    isOwner: m.orgRole.isOwner,
    unitId: m.unitId,
    unitName: m.unit?.name ?? null,
    joinedLabel: joinedFormatter.format(m.createdAt),
    isYou: m.userId === membership.userId,
    manageable: adminView && m.userId !== membership.userId && !m.orgRole.isOwner && mayGrant(membership, scope, { role: m.orgRole, unitId: m.unitId, unitPath: m.unit?.path ?? null }),
  }));
  const visibleInvites = invites.map((invite) => ({ id: invite.id, token: invite.token, createdAt: invite.createdAt, grantLabel: grantLabel(invite.orgRole.name, invite.unit?.name) }));
  const transfer = can(membership, "ownership.transfer", { write: true })
    ? await ownershipChoices(organisation.id, membership.userId, roles, now)
    : null;
  const offer = await prisma.ownershipTransfer.findFirst({
    where: { ...openTransferWhere(organisation.id), toUserId: membership.userId, expiresAt: { gt: now } },
    select: { token: true, expiresAt: true, fromUser: { select: { name: true } }, keepRole: { select: { name: true } } },
  });
  return {
    organisation, profile, adminView, memberCount, roleCounts, recentCount, recentHint, openInviteCount, rows, membership, memberPages, memberPage, baseUrl,
    invites: visibleInvites, units, roleOptions, canGrantOrgWide, transfer, now,
    offer: offer ? { token: offer.token, fromName: offer.fromUser.name ?? "The owner", keepRoleName: offer.keepRole.name, expiresLabel: expiryFormatter.format(offer.expiresAt) } : null,
    roles: roles.filter((role) => !role.archivedAt).map((role) => ({ id: role.id, name: role.name, description: role.description, isOwner: role.isOwner, holders: holders.get(role.id) ?? 0 })),
    canManageRoles: can(membership, "roles.manage", { write: true }),
  };
}

/**
 * Who the owner can offer the organisation to (staff for the whole organisation), the roles they can keep, and the
 * offer already waiting, if any.
 */
async function ownershipChoices(organisationId: string, ownerUserId: string, roles: Array<{ id: string; name: string; isOwner: boolean; archivedAt: Date | null }>, now: Date) {
  const [people, open] = await Promise.all([
    prisma.teamMember.findMany({
      where: { organisationId, unitId: null, userId: { not: ownerUserId }, orgRole: { isOwner: false } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    prisma.ownershipTransfer.findFirst({
      where: { ...openTransferWhere(organisationId), expiresAt: { gt: now } },
      select: { expiresAt: true, toUser: { select: { name: true, email: true } } },
    }),
  ]);
  const keepRoles = roles.filter((role) => !role.isOwner && !role.archivedAt).map(({ id, name }) => ({ id, name }));
  const manager = STARTER_ROLES.find((starter) => starter.key === "ADMIN")?.name;
  return {
    candidates: people.map((person) => ({ userId: person.userId, name: person.user.name ?? person.user.email ?? "Unnamed member" })),
    keepRoles,
    defaultKeepRoleId: keepRoles.find((role) => role.name === manager)?.id ?? null,
    pending: open ? { toName: open.toUser.name ?? open.toUser.email ?? "Unnamed member", expiresLabel: expiryFormatter.format(open.expiresAt) } : null,
  };
}
