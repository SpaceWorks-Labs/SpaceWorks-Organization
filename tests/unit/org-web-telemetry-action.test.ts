import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rateLimit: vi.fn(),
  findOrg: vi.fn(),
  updateOrg: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ orgActionAccess: mocks.access }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: { organisation: { findUnique: mocks.findOrg, update: mocks.updateOrg } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/cache", () => ({ invalidateOrg: mocks.invalidate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { saveOrgWebTelemetry } from "@/app/actions/org-web-telemetry";
import { STARTER_ROLES, can, type StaffActor } from "@/lib/permissionRoles";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

const ga4 = (): WebTelemetryConfig => ({ ...emptyTelemetryConfig(), pageview: { provider: "ga4", siteId: "G-FAKE123", endpoint: "" } });
const call = (config: unknown, organisationSlug = "example-org") => saveOrgWebTelemetry({ organisationSlug, config });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.access.mockResolvedValue({ ok: true, userId: "owner_1", organisation: { id: "org_1", slug: "example-org", name: "Example", status: "ACTIVE" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.findOrg.mockResolvedValue({ webTelemetry: null });
});

describe("saveOrgWebTelemetry", () => {
  it("gates on the Owner-only permission, for the named organisation, before anything is read or written", async () => {
    mocks.access.mockResolvedValue({ ok: false, error: "Organisation not found." });
    await expect(call(ga4(), "other-org")).resolves.toEqual({ ok: false, error: "Organisation not found." });
    expect(mocks.access).toHaveBeenCalledWith("other-org", "org.delete");
    expect(mocks.findOrg).not.toHaveBeenCalled();
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses a role that lacks the permission, with nothing written", async () => {
    mocks.access.mockResolvedValue({ ok: false, error: "Your role doesn't allow this." });
    await expect(call(ga4())).resolves.toMatchObject({ ok: false });
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    await expect(call(ga4())).resolves.toMatchObject({ ok: false });
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("saves on the organisation row only, audits changed field names, and drops the caches", async () => {
    await expect(call(ga4())).resolves.toEqual({ ok: true });
    expect(mocks.updateOrg).toHaveBeenCalledWith({ where: { id: "org_1" }, data: { webTelemetry: ga4() } });
    const audit = mocks.audit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "ORG_WEB_TELEMETRY_UPDATED", actorUserId: "owner_1", organisationId: "org_1", targetType: "Organisation", targetId: "org_1" });
    expect(audit.metadata).toEqual({ changed: "pageview.provider,pageview.siteId" });
    expect(JSON.stringify(audit)).not.toContain("G-FAKE123");
    expect(mocks.invalidate).toHaveBeenCalledWith("org_1", "public-page");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/example-org/settings/analytics");
  });

  it("does nothing, and writes no audit row, when nothing changed", async () => {
    mocks.findOrg.mockResolvedValue({ webTelemetry: ga4() });
    await expect(call(ga4())).resolves.toEqual({ ok: true });
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects Mixpanel, unknown keys and secret-looking fields", async () => {
    for (const bad of [{ ...ga4(), mixpanel: { token: "abc" } }, { ...ga4(), apiSecret: "shh" }, { ...ga4(), pageview: { provider: "mixpanel", siteId: "abc", endpoint: "" } }]) {
      await expect(call(bad)).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("rejects an origin the operator has not approved, and accepts one they have", async () => {
    const umami = (endpoint: string): WebTelemetryConfig => ({ ...emptyTelemetryConfig(), pageview: { provider: "umami", siteId: "00000000-0000-4000-8000-000000000000", endpoint } });
    await expect(call(umami("https://umami.example.org"))).resolves.toMatchObject({ ok: false });
    vi.stubEnv("WEB_TELEMETRY_ALLOWED_ORIGINS", "https://umami.example.org");
    await expect(call(umami("https://umami.example.org"))).resolves.toEqual({ ok: true });
    await expect(call(umami("https://evil.example.net"))).resolves.toMatchObject({ ok: false });
  });

  it("rejects malformed input before any access check", async () => {
    await expect(saveOrgWebTelemetry({ config: ga4() })).resolves.toMatchObject({ ok: false });
    expect(mocks.access).not.toHaveBeenCalled();
  });
});

describe("who holds the permission the action checks", () => {
  const actor = (key: string, unitId: string | null = null): StaffActor => {
    const starter = STARTER_ROLES.find((role) => role.key === key)!;
    return { orgRole: { isOwner: starter.isOwner, capabilities: starter.capabilities }, unitId };
  };

  it("is the Owner alone: managers, treasurers and viewers cannot, and no custom role can be given it", () => {
    expect(can(actor("OWNER"), "org.delete", { write: true })).toBe(true);
    for (const key of ["ADMIN", "TREASURER", "VIEWER"]) expect(can(actor(key), "org.delete", { write: true })).toBe(false);
    expect(can({ orgRole: { isOwner: false, capabilities: ["org.delete"] }, unitId: null }, "org.delete", { write: true })).toBe(false);
  });
});
