import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findOrg: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { organisation: { findUnique: mocks.findOrg } } }));

import { loadOrgPrivacyNoteView, loadOrgWebTelemetryView } from "@/lib/views/app__o__orgSlug__telemetry";
import { parseOrgTelemetry, telemetryScopeApplies } from "@/lib/telemetry/organisation";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

const plausible = (): WebTelemetryConfig => ({ ...emptyTelemetryConfig(), pageview: { provider: "plausible", siteId: "example.org", endpoint: "" } });
const params = Promise.resolve({ orgSlug: "example-org" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.auth.mockResolvedValue(null);
  mocks.findOrg.mockResolvedValue({ id: "org_1", status: "ACTIVE", webTelemetry: plausible() });
});

describe("which telemetry runs where", () => {
  it("runs the organisation config only under /o/ and the platform config everywhere else", () => {
    expect(telemetryScopeApplies("org", "/o/example-org")).toBe(true);
    expect(telemetryScopeApplies("org", "/o/example-org/join/standard")).toBe(true);
    expect(telemetryScopeApplies("org", "/about")).toBe(false);
    expect(telemetryScopeApplies("org", null)).toBe(false);
    expect(telemetryScopeApplies("platform", "/o/example-org")).toBe(false);
    expect(telemetryScopeApplies("platform", "/about")).toBe(true);
  });
});

describe("organisation telemetry view", () => {
  it("returns the organisation's own public config under its own consent scope, with no Mixpanel", async () => {
    await expect(loadOrgWebTelemetryView({ params })).resolves.toEqual({ scopeId: "org:org_1", config: plausible(), mixpanel: null });
  });

  it("returns nothing for a signed-in visitor, and never reads the organisation", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    await expect(loadOrgWebTelemetryView({ params })).resolves.toBeNull();
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });

  it("returns nothing for an unknown or non-active organisation, or one with nothing configured", async () => {
    mocks.findOrg.mockResolvedValueOnce(null);
    await expect(loadOrgWebTelemetryView({ params })).resolves.toBeNull();
    mocks.findOrg.mockResolvedValueOnce({ id: "org_1", status: "SUSPENDED", webTelemetry: plausible() });
    await expect(loadOrgWebTelemetryView({ params })).resolves.toBeNull();
    mocks.findOrg.mockResolvedValueOnce({ id: "org_1", status: "ACTIVE", webTelemetry: null });
    await expect(loadOrgWebTelemetryView({ params })).resolves.toBeNull();
  });

  it("treats a saved origin the operator has since removed, or a Mixpanel key, as unset", async () => {
    vi.stubEnv("WEB_TELEMETRY_ALLOWED_ORIGINS", "");
    mocks.findOrg.mockResolvedValue({ id: "org_1", status: "ACTIVE", webTelemetry: { ...emptyTelemetryConfig(), pageview: { provider: "umami", siteId: "00000000-0000-4000-8000-000000000000", endpoint: "https://umami.example.org" } } });
    await expect(loadOrgWebTelemetryView({ params })).resolves.toBeNull();
    expect(parseOrgTelemetry({ ...plausible(), mixpanel: { token: "abc" } }).configured).toBe(false);
  });

  it("lists provider names and purposes for the privacy note, without ids", async () => {
    const note = await loadOrgPrivacyNoteView({ params });
    expect(note).toEqual({ providers: [{ name: "Plausible", purpose: "analytics" }] });
    expect(JSON.stringify(note)).not.toContain("example.org");
  });
});
