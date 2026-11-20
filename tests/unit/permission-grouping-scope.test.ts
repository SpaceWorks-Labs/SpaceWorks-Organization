import { describe, expect, it } from "vitest";
import { CAPABILITY_LIST, ORG_WIDE_ONLY, ORG_WIDE_TO_CHANGE, STARTER_ROLES, can, canGrant, effectiveCapabilities, isScopedActor, type StaffActor } from "@/lib/permissionRoles";

const role = (key: string) => STARTER_ROLES.find((entry) => entry.key === key)!;
const limit = [{ groupingId: "g", valueId: "v" }];
const actor = (key: string, extra: Partial<StaffActor> = {}): StaffActor => ({ orgRole: role(key), unitId: null, ...extra });

describe("staff limited by a grouping are scoped like staff limited to a unit", () => {
  it("count as scoped with any grouping limit, and not without one", () => {
    expect(isScopedActor(actor("ADMIN"))).toBe(false);
    expect(isScopedActor(actor("ADMIN", { scopes: [] }))).toBe(false);
    expect(isScopedActor(actor("ADMIN", { scopes: limit }))).toBe(true);
    expect(isScopedActor(actor("ADMIN", { unitId: "u" }))).toBe(true);
  });

  it("read ◆ screens but never change them, and never use ● at all, exactly as for a unit", () => {
    for (const capability of CAPABILITY_LIST) {
      const byUnit = actor("ADMIN", { unitId: "u" });
      const byGrouping = actor("ADMIN", { scopes: limit });
      expect(can(byGrouping, capability)).toBe(can(byUnit, capability));
      expect(can(byGrouping, capability, { write: true })).toBe(can(byUnit, capability, { write: true }));
    }
    const limited = actor("ADMIN", { scopes: limit });
    expect(can(limited, "groupings.manage")).toBe(false);
    expect(can(limited, "reports.gstr1")).toBe(false);
    expect(can(limited, "plans.manage")).toBe(true);
    expect(can(limited, "plans.manage", { write: true })).toBe(false);
    expect(ORG_WIDE_ONLY.has("groupings.manage")).toBe(true);
    expect(ORG_WIDE_TO_CHANGE.has("groupings.manage")).toBe(false);
  });

  it("give the Owner and Manager groupings.manage and nobody else", () => {
    expect(can(actor("OWNER"), "groupings.manage", { write: true })).toBe(true);
    expect(can(actor("ADMIN"), "groupings.manage", { write: true })).toBe(true);
    expect(can(actor("TREASURER"), "groupings.manage")).toBe(false);
    expect(can(actor("VIEWER"), "groupings.manage")).toBe(false);
    expect(effectiveCapabilities(role("ADMIN"), true).has("groupings.manage")).toBe(false);
  });

  it("let a limited giver grant only a role that grants strictly less, held for a limit", () => {
    const giver = actor("ADMIN", { scopes: limit });
    expect(canGrant(giver, role("VIEWER"), true)).toBe(true);
    expect(canGrant(giver, role("ADMIN"), true)).toBe(false);
    expect(canGrant(actor("OWNER", { scopes: limit }), role("ADMIN"), true)).toBe(true);
  });
});
