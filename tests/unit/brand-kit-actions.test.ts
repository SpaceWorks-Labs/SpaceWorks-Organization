import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Brand kit actions (app/actions/brand-kit.ts) through the real orgActionAccess and can(): only staff holding
 * cards.design for the whole organisation change the kit, only in their own organisation; logos must be the
 * organisation's own uploads, and every save is audited.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  palette: vi.fn(),
  store: vi.fn(),
  orgFindUnique: vi.fn(),
  teamMemberFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  orgRoleFindFirst: vi.fn(),
  kitFindUnique: vi.fn(),
  kitUpsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit, recordThrottledAuditEvent: mocks.audit }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/cards/logoPalette", () => ({ paletteFromLogoUrl: mocks.palette }));
vi.mock("@/lib/logo/store", () => ({ storeOrganisationLogo: mocks.store }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.orgFindUnique },
    teamMember: { findUnique: mocks.teamMemberFindUnique },
    user: { findUnique: mocks.userFindUnique },
    orgRole: { findFirst: mocks.orgRoleFindFirst },
    cardBrandKit: { findUnique: mocks.kitFindUnique, upsert: mocks.kitUpsert },
  },
}));

import { extractBrandColours, saveCardBrandKit, uploadBrandKitLogo } from "@/app/actions/brand-kit";

const ORGS: Record<string, { id: string; slug: string; name: string; status: string; logoUrl?: string | null }> = {
  acme: { id: "org_acme", slug: "acme", name: "Acme Club", status: "ACTIVE" },
  other: { id: "org_other", slug: "other", name: "Other Club", status: "ACTIVE" },
};
const OWN_LOGO = "http://localhost:3000/api/uploads/organisations/org_acme/organisation-logos/a.webp";
const OTHER_LOGO = "http://localhost:3000/api/uploads/organisations/org_other/organisation-logos/b.webp";
const DESIGNER = ["org.view", "cards.design"];

function teamRow(capabilities: string[], unitId: string | null = null) {
  mocks.teamMemberFindUnique.mockImplementation(({ where }: { where: { userId_organisationId: { organisationId: string } } }) =>
    Promise.resolve(where.userId_organisationId.organisationId === "org_acme"
      ? { id: "team_1", userId: "user_1", organisationId: "org_acme", role: "MANAGER", roleId: "role_1", unitId, reportDigest: false, createdAt: new Date(0), orgRole: { id: "role_1", isOwner: false, capabilities } }
      : null));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.orgFindUnique.mockImplementation(({ where }: { where: { slug?: string; id?: string } }) =>
    Promise.resolve(where.slug ? ORGS[where.slug] ?? null : where.id === "org_acme" ? { logoUrl: OWN_LOGO } : null));
  mocks.userFindUnique.mockResolvedValue({ isSuperAdmin: false, emailVerified: new Date(), mfaEnabledAt: new Date() });
  mocks.kitFindUnique.mockResolvedValue(null);
  mocks.kitUpsert.mockResolvedValue({});
  teamRow(DESIGNER);
});

describe("saveCardBrandKit", () => {
  it("saves a normalised kit, dropping other organisations' logos, and audits it", async () => {
    const result = await saveCardBrandKit({ organisationSlug: "acme", kit: { logos: [OWN_LOGO, OTHER_LOGO, "https://evil.example/x.png"], colours: ["#006e63", "nope"], fonts: ["gilroy", "nope"] } });
    const kit = { logos: [OWN_LOGO], colours: ["#006E63"], fonts: ["gilroy"] };
    expect(result).toEqual({ ok: true, data: { kit } });
    expect(mocks.kitUpsert).toHaveBeenCalledWith({ where: { organisationId: "org_acme" }, create: { organisationId: "org_acme", kit, updatedById: "user_1" }, update: { kit, updatedById: "user_1" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "CARD_BRAND_KIT_UPDATED", actorUserId: "user_1", organisationId: "org_acme", metadata: { logos: 1, colours: 1, fonts: 1 } }));
  });

  it("refuses a role without cards.design, staff limited to a unit, and other organisations", async () => {
    teamRow(["org.view", "members.view"]);
    expect(await saveCardBrandKit({ organisationSlug: "acme", kit: {} })).toEqual({ ok: false, error: "Your role doesn't allow this." });
    teamRow(DESIGNER, "unit_1");
    expect((await saveCardBrandKit({ organisationSlug: "acme", kit: {} })).ok).toBe(false);
    teamRow(DESIGNER);
    expect(await saveCardBrandKit({ organisationSlug: "other", kit: {} })).toEqual({ ok: false, error: "Organisation not found." });
    expect(mocks.kitUpsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    expect(await saveCardBrandKit({ organisationSlug: "acme", kit: {} })).toEqual({ ok: false, error: "Too many requests. Try again shortly." });
  });
});

describe("extractBrandColours", () => {
  it("reads the current logo when none is named", async () => {
    mocks.palette.mockResolvedValue(["#006E63", "#FF7447"]);
    expect(await extractBrandColours({ organisationSlug: "acme" })).toEqual({ ok: true, data: { colours: ["#006E63", "#FF7447"] } });
    expect(mocks.palette).toHaveBeenCalledWith(OWN_LOGO);
  });

  it("never reads another organisation's upload or an outside URL", async () => {
    for (const logoUrl of [OTHER_LOGO, "https://evil.example/logo.png", "/api/uploads/organisations/org_acme/member-id-artwork/x.webp"]) {
      expect(await extractBrandColours({ organisationSlug: "acme", logoUrl })).toEqual({ ok: false, error: "Choose one of your organisation's logos." });
    }
    expect(mocks.palette).not.toHaveBeenCalled();
  });

  it("explains a logo that can't be read or has no colours", async () => {
    mocks.palette.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    expect((await extractBrandColours({ organisationSlug: "acme" })).ok).toBe(false);
    expect((await extractBrandColours({ organisationSlug: "acme" })).ok).toBe(false);
  });
});

describe("uploadBrandKitLogo", () => {
  const form = (slug = "acme") => {
    const data = new FormData();
    data.set("organisationSlug", slug);
    data.set("file", new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
    return data;
  };

  it("stores the variant as an organisation logo and adds it to the kit", async () => {
    mocks.kitFindUnique.mockResolvedValue({ kit: { colours: ["#006E63"] } });
    mocks.store.mockResolvedValue({ ok: true, url: OWN_LOGO });
    expect(await uploadBrandKitLogo(form())).toEqual({ ok: true, data: { kit: { logos: [OWN_LOGO], colours: ["#006E63"], fonts: [] } } });
    expect(mocks.store).toHaveBeenCalledWith("org_acme", expect.any(File));
    expect(mocks.rateLimit).toHaveBeenCalledWith("upload", "user_1");
  });

  it("refuses a full kit before storing anything", async () => {
    mocks.kitFindUnique.mockResolvedValue({ kit: { logos: Array.from({ length: 8 }, (_, i) => OWN_LOGO.replace("a.webp", `${i}.webp`)) } });
    expect((await uploadBrandKitLogo(form())).ok).toBe(false);
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
