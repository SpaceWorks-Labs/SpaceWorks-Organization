import type { OrganisationStatus, TeamRole } from "@prisma/client";

/**
 * Every permission a staff role can hold: the fixed list each organisation builds its roles from. Unknown
 * permissions grant nothing.
 */
export const CAPABILITY_LIST = [
  "org.view", "members.view", "reports.membership",
  "members.contact", "members.export", "payments.view", "payments.manage", "reports.finance",
  "members.manage", "cards.manage", "audit.view", "erasure.decide", "team.manage",
  "plans.manage", "payments.settings", "org.settings", "structure.manage", "cards.design", "accounts.manage", "reports.gstr1",
  "roles.manage", "cards.approve", "org.delete", "ownership.transfer",
] as const;

export type Capability = (typeof CAPABILITY_LIST)[number];

/** ◆ Org-wide to change: someone holding the role for one unit may read these screens but never change them. */
export const ORG_WIDE_TO_CHANGE: ReadonlySet<Capability> = new Set<Capability>(["plans.manage", "payments.settings", "org.settings", "structure.manage", "cards.design", "accounts.manage", "roles.manage"]);

/** ● Org-wide for any use: whole-organisation data, refused to someone holding the role for one unit. */
export const ORG_WIDE_ONLY: ReadonlySet<Capability> = new Set<Capability>(["reports.gstr1"]);

/** ★ Owner only: no other role can hold these. */
export const OWNER_ONLY: ReadonlySet<Capability> = new Set<Capability>(["cards.approve", "org.delete", "ownership.transfer"]);

/** The permissions an organisation can put in its own roles. */
export const GRANTABLE_CAPABILITIES: readonly Capability[] = CAPABILITY_LIST.filter((capability) => !OWNER_ONLY.has(capability));

export function isCapability(value: string): value is Capability {
  return (CAPABILITY_LIST as readonly string[]).includes(value);
}

const MANAGER: Capability[] = [
  "org.view", "members.view", "reports.membership", "members.contact", "members.export", "payments.view", "payments.manage", "reports.finance",
  "members.manage", "cards.manage", "audit.view", "erasure.decide", "team.manage",
  "plans.manage", "payments.settings", "org.settings", "structure.manage", "cards.design", "accounts.manage", "reports.gstr1",
];
const TREASURER: Capability[] = ["org.view", "members.view", "reports.membership", "members.contact", "members.export", "payments.view", "payments.manage", "reports.finance", "accounts.manage", "reports.gstr1"];
const VIEWER: Capability[] = ["org.view", "members.view", "reports.membership"];

/**
 * The roles every organisation starts with, matching the four fixed roles they replace (migration 0014 writes the
 * same lists). The owner edits or archives all but Owner.
 */
export const STARTER_ROLES: ReadonlyArray<{ key: TeamRole; name: string; description: string; capabilities: readonly Capability[]; isOwner: boolean }> = [
  { key: "OWNER", name: "Owner", description: "Everything, including the team, roles and deleting the organisation.", capabilities: [], isOwner: true },
  { key: "ADMIN", name: "Manager", description: "Plans, members, approvals, cards, payments and settings.", capabilities: MANAGER, isOwner: false },
  { key: "TREASURER", name: "Treasurer", description: "Payments, receipts and finance reports. Reads members.", capabilities: TREASURER, isOwner: false },
  { key: "VIEWER", name: "Viewer", description: "Reads members and membership reports. Contact details are hidden.", capabilities: VIEWER, isOwner: false },
];

/** A role as permission checks see it. */
export type RoleGrant = { isOwner: boolean; capabilities: readonly string[] };

/** A staff member as permission checks see them: their role, and the unit they hold it for (null: the whole organisation). */
export type StaffActor = { orgRole: RoleGrant; unitId: string | null };

/** What a role grants. The Owner role holds every permission, including ones added later. */
export function roleCapabilities(role: RoleGrant): Set<Capability> {
  if (role.isOwner) return new Set(CAPABILITY_LIST);
  return new Set(role.capabilities.filter((value): value is Capability => isCapability(value) && !OWNER_ONLY.has(value)));
}

/** What a role grants when held for one unit (`scoped`) or for the whole organisation, with ◆ and ● removed for units. */
export function effectiveCapabilities(role: RoleGrant, scoped: boolean): Set<Capability> {
  const held = roleCapabilities(role);
  if (scoped) for (const capability of held) if (ORG_WIDE_TO_CHANGE.has(capability) || ORG_WIDE_ONLY.has(capability)) held.delete(capability);
  return held;
}

/**
 * Whether a staff member may use a permission. `write` is for changes: someone holding a role for one unit can read
 * ◆ screens but never change them, and can't use ● at all.
 */
export function can(actor: StaffActor | null | undefined, capability: Capability, options: { write?: boolean } = {}): boolean {
  if (!actor || !roleCapabilities(actor.orgRole).has(capability)) return false;
  if (!actor.unitId) return true;
  if (ORG_WIDE_ONLY.has(capability)) return false;
  return !(options.write && ORG_WIDE_TO_CHANGE.has(capability));
}

function properSubset(inner: ReadonlySet<Capability>, outer: ReadonlySet<Capability>) {
  if (inner.size >= outer.size) return false;
  for (const capability of inner) if (!outer.has(capability)) return false;
  return true;
}

/**
 * Whether an actor may give someone a role (held for one unit when `scoped`), or change or remove someone who holds
 * it. The Owner may for every other role; anyone else with `team.manage` only for roles that grant strictly less
 * than they hold themselves, comparing what each grants at its own reach. Where (which unit) is checked by the caller.
 */
export function canGrant(actor: StaffActor, role: RoleGrant, scoped: boolean): boolean {
  if (role.isOwner || !can(actor, "team.manage", { write: true })) return false;
  if (actor.orgRole.isOwner) return true;
  // ◆ and ● still open read-only screens when held for a unit, so nobody hands out one they don't hold themselves.
  const held = roleCapabilities(actor.orgRole);
  for (const capability of roleCapabilities(role)) {
    if ((ORG_WIDE_TO_CHANGE.has(capability) || ORG_WIDE_ONLY.has(capability)) && !held.has(capability)) return false;
  }
  return properSubset(effectiveCapabilities(role, scoped), effectiveCapabilities(actor.orgRole, Boolean(actor.unitId)));
}

/**
 * The fixed role still written beside a custom one, so an update rollback keeps working: the most senior starter
 * role that grants nothing the custom role doesn't, never below Viewer.
 */
export function fallbackTeamRole(role: RoleGrant): TeamRole {
  if (role.isOwner) return "OWNER";
  const held = roleCapabilities(role);
  for (const starter of STARTER_ROLES) {
    if (!starter.isOwner && starter.capabilities.every((capability) => held.has(capability))) return starter.key;
  }
  return "VIEWER";
}

/**
 * Capabilities a suspended or archived organisation keeps: money already received must still be
 * confirmed, refunded and receipted, finance records exported, members read, and people's erasure
 * requests decided (a legal right that doesn't pause). Everything else waits.
 */
export const SUSPENDED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["org.view", "members.view", "payments.view", "payments.manage", "reports.finance", "members.export", "erasure.decide", "accounts.manage", "reports.gstr1"]);

/** Whether an organisation in this status may use a capability at all. Before approval: none. */
export function organisationAllows(status: OrganisationStatus, capability: Capability): boolean {
  if (status === "ACTIVE") return true;
  if (status === "SUSPENDED" || status === "ARCHIVED") return SUSPENDED_CAPABILITIES.has(capability);
  return false;
}

/** Staff (anyone on an organisation's team) must use an authenticator app; members and super admins need not. */
export const STAFF_AUTHENTICATOR_SETUP = "/account/security?authenticator=required";
export const STAFF_AUTHENTICATOR_MESSAGE = "Your role in this organisation needs an authenticator app. Set one up under Account, Security, then try again.";
