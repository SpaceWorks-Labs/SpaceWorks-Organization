import {
  CAPABILITY_LIST,
  effectiveCapabilities,
  GRANTABLE_CAPABILITIES,
  ORG_WIDE_ONLY,
  ORG_WIDE_TO_CHANGE,
  type Capability,
  type StaffActor,
} from "@/lib/permissionRoles";

/** Client-safe: the role editor's labels, sections and templates, and the pure rules for who may edit a role. */

type CapabilityGroup = { title: string; items: Array<{ capability: Capability; label: string }> };

export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  {
    title: "Members",
    items: [
      { capability: "org.view", label: "Open the dashboard" },
      { capability: "members.view", label: "See members" },
      { capability: "members.contact", label: "See members' email addresses and phone numbers" },
      { capability: "members.manage", label: "Add, edit, approve and renew members" },
      { capability: "members.export", label: "Export member lists" },
      { capability: "erasure.decide", label: "Decide requests to erase personal data" },
    ],
  },
  {
    title: "Money",
    items: [
      { capability: "payments.view", label: "See payments and receipts" },
      { capability: "payments.manage", label: "Record payments, confirm claims and refund" },
      { capability: "accounts.manage", label: "Record other receipts and expenses" },
      { capability: "payments.settings", label: "Change payment gateways and tax settings" },
    ],
  },
  {
    title: "Reports",
    items: [
      { capability: "reports.membership", label: "Membership reports" },
      { capability: "reports.finance", label: "Finance reports" },
      { capability: "reports.gstr1", label: "GSTR-1 export" },
      { capability: "audit.view", label: "Read the activity log" },
    ],
  },
  {
    title: "Cards",
    items: [
      { capability: "cards.manage", label: "Issue, reissue and revoke member cards" },
      { capability: "cards.design", label: "Draft card designs" },
    ],
  },
  {
    title: "Organisation",
    items: [
      { capability: "plans.manage", label: "Create and change membership plans" },
      { capability: "org.settings", label: "Change the profile, public page, email and notifications" },
      { capability: "structure.manage", label: "Change units, levels and member roles" },
      { capability: "team.manage", label: "Invite staff and change their roles" },
      { capability: "roles.manage", label: "Create and edit staff roles" },
    ],
  },
];

const LABELS = new Map(CAPABILITY_GROUPS.flatMap((group) => group.items.map((item) => [item.capability, item.label] as const)));

export function capabilityLabel(capability: Capability) {
  return LABELS.get(capability) ?? capability;
}

/** Whether a permission works only for staff holding the role for the whole organisation (◆ to change, ● at all). */
export function isOrgWide(capability: Capability) {
  return ORG_WIDE_TO_CHANGE.has(capability) || ORG_WIDE_ONLY.has(capability);
}

/** One-click starting points for a new role. A template only fills the form. */
export const ROLE_TEMPLATES: ReadonlyArray<{ name: string; description: string; capabilities: readonly Capability[] }> = [
  {
    name: "Area head",
    description: "Runs the members, payments and cards of one area.",
    capabilities: ["org.view", "members.view", "members.contact", "members.manage", "payments.view", "reports.membership", "cards.manage"],
  },
  {
    name: "Unit secretary",
    description: "Keeps one unit's members, payments and cards up to date.",
    capabilities: ["org.view", "members.view", "members.manage", "payments.view", "payments.manage", "cards.manage"],
  },
];

/** The grantable permissions from a list, de-duplicated and in the fixed order; null if any isn't grantable. */
export function normaliseCapabilities(values: readonly string[]): Capability[] | null {
  const wanted = new Set(values);
  for (const value of wanted) if (!(GRANTABLE_CAPABILITIES as readonly string[]).includes(value)) return null;
  return CAPABILITY_LIST.filter((capability) => wanted.has(capability));
}

/** The permissions someone may put in a role: the Owner any grantable one, anyone else only what they hold themselves. */
export function editableCapabilities(actor: StaffActor): Set<Capability> {
  if (actor.orgRole.isOwner) return new Set(GRANTABLE_CAPABILITIES);
  const own = effectiveCapabilities(actor.orgRole, Boolean(actor.unitId));
  return new Set(GRANTABLE_CAPABILITIES.filter((capability) => own.has(capability)));
}

/** Whether every permission in a list is one the actor may put in a role. */
export function withinEditorReach(actor: StaffActor, capabilities: readonly string[]) {
  const allowed = editableCapabilities(actor);
  return capabilities.every((capability) => allowed.has(capability as Capability));
}

export const ROLE_TOO_WIDE = "This role grants as much as yours or more, so only the owner can change it.";

/**
 * Whether the actor may edit a role granting these permissions (or make it grant them): the Owner any, anyone else
 * only a role granting strictly less than they may give, as with `canGrant`, so peers never edit each other's role.
 */
export function mayEditRole(actor: StaffActor, capabilities: readonly string[]) {
  if (!withinEditorReach(actor, capabilities)) return false;
  return actor.orgRole.isOwner || new Set(capabilities).size < editableCapabilities(actor).size;
}
