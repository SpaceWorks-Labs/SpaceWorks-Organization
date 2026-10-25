import type { OrganisationStatus, TeamMember, TeamRole } from "@prisma/client";

/**
 * What each organisation role may do. OWNER and ADMIN run the organisation; TREASURER runs money and
 * reads members; VIEWER reads, with contact details masked. Unknown capabilities grant nothing.
 */
export const CAPABILITIES = {
  "org.view": ["OWNER", "ADMIN", "TREASURER", "VIEWER"],
  "org.settings": ["OWNER", "ADMIN"],
  "org.delete": ["OWNER"],
  "team.manage": ["OWNER", "ADMIN"],
  "plans.manage": ["OWNER", "ADMIN"],
  "members.view": ["OWNER", "ADMIN", "TREASURER", "VIEWER"],
  "members.contact": ["OWNER", "ADMIN", "TREASURER"],
  "members.manage": ["OWNER", "ADMIN"],
  "members.export": ["OWNER", "ADMIN", "TREASURER"],
  "cards.manage": ["OWNER", "ADMIN"],
  /** Putting a card design (and its numbering) on members' cards. Managers draft; the owner approves. */
  "cards.approve": ["OWNER"],
  "payments.view": ["OWNER", "ADMIN", "TREASURER"],
  "payments.manage": ["OWNER", "ADMIN", "TREASURER"],
  "payments.settings": ["OWNER", "ADMIN"],
  "reports.membership": ["OWNER", "ADMIN", "TREASURER", "VIEWER"],
  "reports.finance": ["OWNER", "ADMIN", "TREASURER"],
  "audit.view": ["OWNER", "ADMIN"],
  "erasure.decide": ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly TeamRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: TeamRole | null | undefined, capability: Capability): boolean {
  return role != null && (CAPABILITIES[capability] as readonly TeamRole[]).includes(role);
}

/**
 * Capabilities a suspended or archived organisation keeps: money already received must still be
 * confirmed, refunded and receipted, finance records exported, members read, and people's erasure
 * requests decided (a legal right that doesn't pause). Everything else waits.
 */
export const SUSPENDED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["org.view", "members.view", "payments.view", "payments.manage", "reports.finance", "members.export", "erasure.decide"]);

/** Whether an organisation in this status may use a capability at all. Before approval: none. */
export function organisationAllows(status: OrganisationStatus, capability: Capability): boolean {
  if (status === "ACTIVE") return true;
  if (status === "SUSPENDED" || status === "ARCHIVED") return SUSPENDED_CAPABILITIES.has(capability);
  return false;
}

/** Seniority, only for "at least" gates and for who may change whose role. */
const roleRank: Record<TeamRole, number> = { VIEWER: 0, TREASURER: 1, ADMIN: 2, OWNER: 3 };

export function hasRoleAtLeast(role: TeamRole, min: TeamRole): boolean {
  return roleRank[role] >= roleRank[min];
}

export function isOrgAdmin(role: TeamRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Owners manage everyone; managers (ADMIN) manage treasurers and viewers. Nobody manages a more senior role. */
export function canManageTeamMember(actor: TeamRole, target: TeamRole): boolean {
  if (actor === "OWNER") return true;
  return actor === "ADMIN" && roleRank[target] < roleRank.ADMIN;
}

export function canManageTeam(m: TeamMember | null): boolean {
  return m != null && can(m.role, "team.manage");
}

export function canDeleteOrg(m: TeamMember | null): boolean {
  return m != null && can(m.role, "org.delete");
}

export const ROLE_LABELS: Record<TeamRole, string> = { OWNER: "Owner", ADMIN: "Manager", TREASURER: "Treasurer", VIEWER: "Viewer" };

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  OWNER: "Everything, including the team and deleting the organisation.",
  ADMIN: "Plans, members, approvals, cards, payments and settings.",
  TREASURER: "Payments, receipts and finance reports. Reads members.",
  VIEWER: "Reads members and membership reports. Contact details are hidden.",
};

export function roleLabel(role: TeamRole) {
  return ROLE_LABELS[role];
}

/** Staff (anyone on an organisation's team) must use an authenticator app; members and super admins need not. */
export const STAFF_AUTHENTICATOR_SETUP = "/account/security?authenticator=required";
export const STAFF_AUTHENTICATOR_MESSAGE = "Your role in this organisation needs an authenticator app. Set one up under Account, Security, then try again.";
