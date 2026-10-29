import { describe, expect, it } from "vitest";
import {
  createOrgInviteSchema,
  organisationSlugSchema,
  updateOrganisationSchema,
  updateTeamRoleSchema,
} from "@/lib/validators";

describe("organisation web address", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(organisationSlugSchema.safeParse("kochi-runners").success).toBe(true);
    expect(organisationSlugSchema.parse("  rotary-club-2  ")).toBe("rotary-club-2");
  });

  it("rejects capitals, double or edge hyphens, and very short addresses", () => {
    for (const slug of ["Kochi", "kochi--runners", "-kochi", "kochi-", "k", "kochi runners", "kochi_runners"]) {
      expect(organisationSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("refuses reserved addresses that would shadow app routes", () => {
    for (const slug of ["dashboard", "super-admin", "api", "verify", "start", "login"]) {
      expect(organisationSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe("team roles", () => {
  // Roles are the organisation's own: the actions refuse the Owner role and anything the actor can't give.
  it("never hands out ownership through the role form", () => {
    expect(updateTeamRoleSchema.safeParse({ organisationSlug: "acme", targetUserId: "u", role: "OWNER" }).success).toBe(false);
    expect(updateTeamRoleSchema.parse({ organisationSlug: "acme", targetUserId: "u", roleId: "role_1", role: "OWNER" })).toEqual({ organisationSlug: "acme", targetUserId: "u", roleId: "role_1" });
  });

  it("never lets an invite fall back to a role nobody chose", () => {
    expect(createOrgInviteSchema.safeParse({ organisationSlug: "acme" }).success).toBe(false);
    expect(createOrgInviteSchema.safeParse({ organisationSlug: "acme", role: "OWNER" }).success).toBe(false);
    expect(createOrgInviteSchema.parse({ organisationSlug: "acme", roleId: "role_1", unitId: "" })).toEqual({ organisationSlug: "acme", roleId: "role_1", unitId: null });
  });
});

describe("organisation settings", () => {
  const base = { organisationSlug: "demo", name: "Demo" };

  it("allows uploaded managed logos only", () => {
    expect(updateOrganisationSchema.safeParse({ ...base, logoUrl: "/api/uploads/organisations/org_1/organisation-logos/image.webp" }).success).toBe(true);
    expect(updateOrganisationSchema.safeParse({ ...base, logoUrl: "" }).success).toBe(true);
    expect(updateOrganisationSchema.safeParse({ ...base, logoUrl: "https://images.example.test/logo.png" }).success).toBe(false);
    expect(updateOrganisationSchema.safeParse({ ...base, logoUrl: "data:text/html,unsafe" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(updateOrganisationSchema.safeParse({ ...base, name: "   ", logoUrl: "" }).success).toBe(false);
  });
});
