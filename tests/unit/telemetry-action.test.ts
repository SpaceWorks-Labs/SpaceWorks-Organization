import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  rateLimit: vi.fn(),
  findSetting: vi.fn(),
  upsertSetting: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: { instanceSetting: { findUnique: mocks.findSetting, upsert: mocks.upsertSetting } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

import { saveWebTelemetry } from "@/app/actions/web-telemetry";
import { loadWebTelemetryView } from "@/lib/views/app__layout";
import { loadWebTelemetrySettingsView } from "@/lib/views/app__super-admin__settings__telemetry";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

const ga4 = (): WebTelemetryConfig => ({ ...emptyTelemetryConfig(), pageview: { provider: "ga4", siteId: "G-FAKE123", endpoint: "" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.requireSuperAdmin.mockResolvedValue({ user: { id: "admin_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.findSetting.mockResolvedValue(null);
});

describe("saveWebTelemetry", () => {
  it("is for super admins only: the gate runs first and nothing is written when it throws", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(saveWebTelemetry(ga4())).rejects.toThrow("forbidden");
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    await expect(saveWebTelemetry(ga4())).resolves.toMatchObject({ ok: false });
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
  });

  it("saves the validated config on the instance row and audits the changed field names only", async () => {
    await expect(saveWebTelemetry(ga4())).resolves.toEqual({ ok: true });
    expect(mocks.upsertSetting).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "global" }, update: { webTelemetry: ga4() } }));
    const audit = mocks.audit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "WEB_TELEMETRY_UPDATED", actorUserId: "admin_1", targetType: "InstanceSetting", targetId: "global" });
    expect(audit.metadata).toEqual({ changed: "pageview.provider,pageview.siteId" });
    expect(JSON.stringify(audit)).not.toContain("G-FAKE123");
    expect(mocks.revalidate).toHaveBeenCalledWith("/super-admin/settings");
  });

  it("does nothing, and writes no audit row, when nothing changed", async () => {
    mocks.findSetting.mockResolvedValue({ webTelemetry: emptyTelemetryConfig() });
    await expect(saveWebTelemetry(emptyTelemetryConfig())).resolves.toEqual({ ok: true });
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses secrets, unknown fields and origins the operator has not approved", async () => {
    await expect(saveWebTelemetry({ ...ga4(), apiSecret: "x" })).resolves.toMatchObject({ ok: false });
    const umami = { ...emptyTelemetryConfig(), pageview: { provider: "umami", siteId: "00000000-0000-4000-8000-000000000000", endpoint: "https://umami.example.org" } };
    await expect(saveWebTelemetry(umami)).resolves.toMatchObject({ ok: false });
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
    vi.stubEnv("WEB_TELEMETRY_ALLOWED_ORIGINS", "https://umami.example.org");
    await expect(saveWebTelemetry(umami)).resolves.toEqual({ ok: true });
    expect(mocks.upsertSetting).toHaveBeenCalled();
  });
});

describe("public telemetry reader", () => {
  it("returns nothing to a signed-in session, even when configured", async () => {
    mocks.findSetting.mockResolvedValue({ webTelemetry: ga4() });
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    await expect(loadWebTelemetryView()).resolves.toBeNull();
    expect(mocks.findSetting).not.toHaveBeenCalled();
  });

  it("returns the platform config to a visitor, and null while nothing is configured", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(loadWebTelemetryView()).resolves.toBeNull();
    mocks.findSetting.mockResolvedValue({ webTelemetry: ga4() });
    await expect(loadWebTelemetryView()).resolves.toEqual({ scopeId: "platform", config: ga4(), mixpanel: null });
  });

  it("treats a stored row that fails today's allow-list as not configured, and lets Mixpanel in from the environment", async () => {
    mocks.auth.mockResolvedValue(null);
    const umami = { ...emptyTelemetryConfig(), pageview: { provider: "umami", siteId: "00000000-0000-4000-8000-000000000000", endpoint: "https://umami.example.org" } };
    mocks.findSetting.mockResolvedValue({ webTelemetry: umami });
    await expect(loadWebTelemetryView()).resolves.toBeNull();
    vi.stubEnv("WEB_TELEMETRY_MIXPANEL_TOKEN", "tok_1");
    await expect(loadWebTelemetryView()).resolves.toMatchObject({ mixpanel: { token: "tok_1" } });
  });

  it("gives the settings reader to super admins only", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(loadWebTelemetrySettingsView()).rejects.toThrow("forbidden");
  });
});
