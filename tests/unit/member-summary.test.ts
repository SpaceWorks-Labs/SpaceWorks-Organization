import { describe, expect, it } from "vitest";
import { filterTeam, firstName, grantLabel, leastPrivilegedRole, roleBreakdown, roleDots, type RoleCount, type TeamMemberRow } from "@/components/team/memberSummary";

const row = (overrides: Partial<TeamMemberRow>): TeamMemberRow => ({
  id: "m",
  userId: "u",
  name: "Someone",
  roleId: "viewer",
  roleName: "Viewer",
  isOwner: false,
  unitId: null,
  unitName: null,
  joinedLabel: "Mar 2025",
  isYou: false,
  manageable: false,
  ...overrides,
});

const counts = (owner: number, manager: number, treasurer: number, viewer: number): RoleCount[] => [
  { id: "owner", name: "Owner", isOwner: true, count: owner },
  { id: "manager", name: "Manager", isOwner: false, count: manager },
  { id: "treasurer", name: "Treasurer", isOwner: false, count: treasurer },
  { id: "viewer", name: "Viewer", isOwner: false, count: viewer },
];

describe("team summary helpers", () => {
  it("describes the role mix by role name, skipping empty roles", () => {
    expect(roleBreakdown(counts(1, 2, 1, 3))).toBe("Owner 1 · Manager 2 · Treasurer 1 · Viewer 3");
    expect(roleBreakdown(counts(1, 0, 0, 1))).toBe("Owner 1 · Viewer 1");
    expect(roleBreakdown(counts(0, 0, 0, 0))).toBe("No one yet");
  });

  it("draws one dot per person up to the cap, ordered by role", () => {
    expect(roleDots(counts(1, 2, 1, 2))).toEqual(["bg-primary", "bg-highlight", "bg-highlight", "bg-info-solid", "bg-line-strong", "bg-line-strong"]);
    const capped = roleDots(counts(1, 4, 1, 194), 24);
    expect(capped).toHaveLength(24);
    expect(capped[0]).toBe("bg-primary");
    expect(capped.filter((tone) => tone === "bg-info-solid")).toHaveLength(1);
    expect(roleDots(counts(0, 0, 0, 0))).toEqual([]);
  });

  it("filters by role and searches email only when it was sent", () => {
    const rows = [
      row({ id: "1", name: "Anand Nair", roleId: "owner", roleName: "Owner", isOwner: true, email: "anand@example.org" }),
      row({ id: "2", name: "Riya Kapoor", roleId: "manager", roleName: "Manager", email: "riya@example.org" }),
      row({ id: "3", name: "Jo Thomas", roleId: "manager", roleName: "Manager", unitId: "south", unitName: "South" }),
      row({ id: "4", name: "Sam Varghese" }),
    ];
    expect(filterTeam(rows, "manager", "").map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterTeam(rows, "viewer", "").map((r) => r.id)).toEqual(["4"]);
    expect(filterTeam(rows, "everyone", "RIYA@").map((r) => r.id)).toEqual(["2"]);
    expect(filterTeam(rows, "everyone", "thomas").map((r) => r.id)).toEqual(["3"]);
    expect(filterTeam(rows.map((r) => ({ ...r, email: undefined })), "everyone", "example.org")).toEqual([]);
  });

  it("labels a grant for one unit with the unit", () => {
    expect(grantLabel("Area head", "South")).toBe("Area head · South");
    expect(grantLabel("Manager", null)).toBe("Manager");
  });

  it("starts invites on the least-privileged role the inviter may give", () => {
    const option = (id: string, permissions: number) => ({ id, name: id, orgWide: true, scoped: true, permissions });
    expect(leastPrivilegedRole([option("treasurer", 10), option("viewer", 3), option("collector", 3)])).toBe("viewer");
    expect(leastPrivilegedRole([])).toBe("");
  });

  it("takes the first name for hints", () => {
    expect(firstName("  Priya L. ")).toBe("Priya");
    expect(firstName(null)).toBeNull();
  });
});
