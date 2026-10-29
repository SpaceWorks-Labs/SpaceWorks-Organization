import { describe, expect, it } from "vitest";
import type { TeamRole } from "@prisma/client";
import {
  CAPABILITY_LIST, GRANTABLE_CAPABILITIES, STARTER_ROLES, can, canGrant, effectiveCapabilities, fallbackTeamRole, roleCapabilities,
  type Capability, type RoleGrant, type StaffActor,
} from "@/lib/permissionRoles";
import { mayEditRole } from "@/lib/team/capabilities";

/** The fixed role map these starter roles replace, as it stood before custom roles (lib/permissionRoles.ts at 719f5a9). */
const BEFORE: Record<string, readonly TeamRole[]> = {
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
  "cards.approve": ["OWNER"],
  "payments.view": ["OWNER", "ADMIN", "TREASURER"],
  "payments.manage": ["OWNER", "ADMIN", "TREASURER"],
  "payments.settings": ["OWNER", "ADMIN"],
  "reports.membership": ["OWNER", "ADMIN", "TREASURER", "VIEWER"],
  "reports.finance": ["OWNER", "ADMIN", "TREASURER"],
  "audit.view": ["OWNER", "ADMIN"],
  "erasure.decide": ["OWNER", "ADMIN"],
};

/** New permissions split out of old ones: each must reach exactly the roles the old gate did. */
const SPLIT_FROM: Partial<Record<Capability, string>> = {
  "structure.manage": "org.settings",
  "cards.design": "org.settings",
  "accounts.manage": "payments.manage",
  "reports.gstr1": "reports.finance",
};

/** Brand new, owner-held permissions. */
const OWNER_HELD: Capability[] = ["roles.manage", "ownership.transfer"];

/** Old gates that refused staff limited to a unit inline (the `ORG_WIDE_ONLY` checks), now ◆ and ● in the list. */
const ORG_WIDE_WRITES = new Set(["org.settings", "plans.manage", "payments.settings", "structure.manage", "cards.design", "accounts.manage"]);

const starter = (key: TeamRole) => STARTER_ROLES.find((role) => role.key === key)!;
const actor = (key: TeamRole, unitId: string | null = null): StaffActor => ({ orgRole: starter(key), unitId });
const ROLES: TeamRole[] = ["OWNER", "ADMIN", "TREASURER", "VIEWER"];

describe("starter roles reproduce the fixed roles", () => {
  for (const key of ROLES) {
    for (const capability of CAPABILITY_LIST) {
      it(`${key} · ${capability}`, () => {
        const before = OWNER_HELD.includes(capability) ? key === "OWNER" : BEFORE[SPLIT_FROM[capability] ?? capability].includes(key);
        // Org-wide holders: exactly as before, for reading and for changing.
        expect(can(actor(key), capability)).toBe(before);
        expect(can(actor(key), capability, { write: true })).toBe(before);
        if (key === "OWNER") return;
        // Holders limited to a unit read what they did; they never change ◆ and never use ●.
        const scoped = actor(key, "unit");
        expect(can(scoped, capability)).toBe(before && capability !== "reports.gstr1");
        expect(can(scoped, capability, { write: true })).toBe(before && capability !== "reports.gstr1" && !ORG_WIDE_WRITES.has(capability) && capability !== "roles.manage");
      });
    }
  }
});

describe("roles an organisation builds", () => {
  it("never carry owner-only permissions or unknown names", () => {
    const role: RoleGrant = { isOwner: false, capabilities: ["members.view", "cards.approve", "org.delete", "ownership.transfer", "made.up"] };
    expect([...roleCapabilities(role)]).toEqual(["members.view"]);
    expect(GRANTABLE_CAPABILITIES).not.toContain("cards.approve");
  });

  it("drop ◆ and ● when held for one unit", () => {
    const manager = effectiveCapabilities(starter("ADMIN"), true);
    expect(manager.has("members.manage")).toBe(true);
    expect(manager.has("plans.manage")).toBe(false);
    expect(manager.has("reports.gstr1")).toBe(false);
  });

  it("give the Owner every permission, including ones added later", () => {
    expect(roleCapabilities({ isOwner: true, capabilities: [] }).size).toBe(CAPABILITY_LIST.length);
  });
});

describe("who may give whom a role", () => {
  const collector: RoleGrant = { isOwner: false, capabilities: ["org.view", "members.view", "payments.view", "payments.manage"] };

  it("matches the fixed roles: owners give any role but Owner, managers give only lesser roles", () => {
    expect(canGrant(actor("OWNER"), starter("ADMIN"), false)).toBe(true);
    expect(canGrant(actor("OWNER"), starter("OWNER"), false)).toBe(false);
    expect(canGrant(actor("ADMIN"), starter("TREASURER"), false)).toBe(true);
    expect(canGrant(actor("ADMIN"), starter("VIEWER"), false)).toBe(true);
    expect(canGrant(actor("ADMIN"), starter("ADMIN"), false)).toBe(false);
    expect(canGrant(actor("TREASURER"), starter("VIEWER"), false)).toBe(false);
  });

  it("compares what each grants at its own reach", () => {
    // A manager for one unit can't give an org-wide Treasurer (accounts and GSTR-1 are org-wide)...
    expect(canGrant(actor("ADMIN", "unit"), starter("TREASURER"), false)).toBe(false);
    // ...but can give it for a unit, where it grants less than they hold there.
    expect(canGrant(actor("ADMIN", "unit"), starter("TREASURER"), true)).toBe(true);
    expect(canGrant(actor("ADMIN", "unit"), collector, true)).toBe(true);
    expect(canGrant(actor("ADMIN", "unit"), starter("ADMIN"), true)).toBe(false);
  });

  it("never hands out an org-wide permission the giver doesn't hold, even for one unit", () => {
    const teamLead: StaffActor = { orgRole: { isOwner: false, capabilities: ["org.view", "members.view", "members.manage", "team.manage", "reports.membership"] }, unitId: null };
    const settingsReader: RoleGrant = { isOwner: false, capabilities: ["org.view", "members.view", "org.settings", "roles.manage", "structure.manage"] };
    expect(canGrant(teamLead, settingsReader, true)).toBe(false);
    expect(canGrant(teamLead, { isOwner: false, capabilities: ["org.view", "members.view"] }, true)).toBe(true);
  });
});

describe("editing a role", () => {
  it("lets the owner edit any role, and anyone else only a role granting strictly less than they may give", () => {
    const deputy: StaffActor = { orgRole: { isOwner: false, capabilities: ["org.view", "members.view", "roles.manage"] }, unitId: null };
    expect(mayEditRole(deputy, ["org.view", "members.view"])).toBe(true);
    expect(mayEditRole(deputy, ["org.view", "members.view", "roles.manage"])).toBe(false);
    expect(mayEditRole(deputy, ["org.view", "members.contact"])).toBe(false);
    expect(mayEditRole(actor("OWNER"), [...GRANTABLE_CAPABILITIES])).toBe(true);
  });
});

describe("the fixed role written beside a custom one", () => {
  it("is the most senior starter role that grants nothing more", () => {
    expect(fallbackTeamRole(starter("OWNER"))).toBe("OWNER");
    expect(fallbackTeamRole(starter("ADMIN"))).toBe("ADMIN");
    expect(fallbackTeamRole({ isOwner: false, capabilities: [...starter("TREASURER").capabilities, "members.manage"] })).toBe("TREASURER");
    expect(fallbackTeamRole({ isOwner: false, capabilities: ["org.view", "members.view", "payments.manage"] })).toBe("VIEWER");
  });

  it("never grants more than the custom role on a rollback, Viewer aside", () => {
    const custom: RoleGrant = { isOwner: false, capabilities: ["org.view", "members.view", "reports.membership", "members.contact", "payments.view", "payments.manage"] };
    const fallback = starter(fallbackTeamRole(custom));
    for (const capability of fallback.capabilities) expect(roleCapabilities(custom).has(capability)).toBe(true);
  });
});
