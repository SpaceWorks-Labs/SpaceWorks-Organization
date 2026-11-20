import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * saveGeneratedLogo and uploadOrganisationLogo (app/actions/media.ts) share one store: org.settings for the whole
 * organisation, the upload rate limit, the organisation-logos key and an audit row naming how the logo was made.
 * The spec is validated before anything is drawn.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  store: vi.fn(),
  render: vi.fn(),
  orgFindUnique: vi.fn(),
  teamMemberFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  orgRoleFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit, recordThrottledAuditEvent: mocks.audit }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/logo/store", () => ({ storeOrganisationLogo: mocks.store }));
vi.mock("@/lib/logo/render", () => ({ renderLogoFile: mocks.render }));
vi.mock("@/lib/logo/icons", () => ({ LOGO_ICON_IDS: new Set(["star"]) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.orgFindUnique },
    teamMember: { findUnique: mocks.teamMemberFindUnique },
    user: { findUnique: mocks.userFindUnique },
    orgRole: { findFirst: mocks.orgRoleFindFirst },
  },
}));

import { saveGeneratedLogo, uploadOrganisationLogo } from "@/app/actions/media";

const URL = "http://localhost:3000/api/uploads/organisations/org_acme/organisation-logos/n.webp";
const spec = { text: "AC", shape: "shield", background: "#142C2A", foreground: "#DFFF8F", font: "gilroy", icon: "star" };

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
  mocks.orgFindUnique.mockImplementation(({ where }: { where: { slug: string } }) => Promise.resolve(where.slug === "acme" ? { id: "org_acme", slug: "acme", name: "Acme", status: "ACTIVE" } : null));
  mocks.userFindUnique.mockResolvedValue({ isSuperAdmin: false, emailVerified: new Date(), mfaEnabledAt: new Date() });
  mocks.store.mockResolvedValue({ ok: true, url: URL });
  mocks.render.mockResolvedValue(new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
  teamRow(["org.view", "org.settings"]);
});

describe("saveGeneratedLogo", () => {
  it("draws a valid spec, stores it as an organisation logo and audits it as generated", async () => {
    expect(await saveGeneratedLogo({ organisationSlug: "acme", spec })).toEqual({ ok: true, data: { url: URL } });
    expect(mocks.render).toHaveBeenCalledWith(spec);
    expect(mocks.store).toHaveBeenCalledWith("org_acme", expect.any(File));
    expect(mocks.rateLimit).toHaveBeenCalledWith("upload", "user_1");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ORGANISATION_LOGO_GENERATED", organisationId: "org_acme", targetId: "org_acme" }));
  });

  it("refuses an invalid spec before checking access or drawing", async () => {
    expect(await saveGeneratedLogo({ organisationSlug: "acme", spec: { ...spec, text: "<svg onload=x>" } })).toEqual({ ok: false, error: "Use up to 12 letters, digits or spaces." });
    expect(await saveGeneratedLogo({ organisationSlug: "acme", spec: { ...spec, icon: "skull" } })).toEqual({ ok: false, error: "Choose an icon from the list." });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("refuses staff without org.settings, staff limited to a unit and other organisations, without drawing", async () => {
    teamRow(["org.view", "cards.design"]);
    expect(await saveGeneratedLogo({ organisationSlug: "acme", spec })).toEqual({ ok: false, error: "Your role doesn't allow this." });
    teamRow(["org.view", "org.settings"], "unit_1");
    expect((await saveGeneratedLogo({ organisationSlug: "acme", spec })).ok).toBe(false);
    teamRow(["org.view", "org.settings"]);
    expect(await saveGeneratedLogo({ organisationSlug: "other", spec })).toEqual({ ok: false, error: "Organisation not found." });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reports a drawing failure through the store's own message", async () => {
    mocks.render.mockRejectedValue(new Error("font"));
    mocks.store.mockResolvedValue({ ok: false, error: "Choose an image to upload." });
    expect((await saveGeneratedLogo({ organisationSlug: "acme", spec })).ok).toBe(false);
    expect(mocks.store).toHaveBeenCalledWith("org_acme", null);
  });
});

describe("uploadOrganisationLogo", () => {
  it("uses the same store and audits an upload", async () => {
    const form = new FormData();
    form.set("organisationSlug", "acme");
    form.set("file", new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
    expect(await uploadOrganisationLogo(form)).toEqual({ ok: true, data: { url: URL } });
    expect(mocks.store).toHaveBeenCalledWith("org_acme", expect.any(File));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ORGANISATION_LOGO_UPLOADED" }));
  });
});
