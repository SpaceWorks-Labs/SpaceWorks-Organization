// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryController, type TelemetryAdapter } from "@/lib/telemetry/controller";
import { providerFactories } from "@/lib/telemetry/providers";
import { analyticsTemplate } from "@/lib/telemetry/routes";
import type { Purpose } from "@/lib/telemetry/policy";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

// Every adapter module is replaced by a recorder: this proves ADMISSION (when a loader runs, with which id, and that
// withdrawal stops it) for every provider with fake ids, no account and no network.
const calls = vi.hoisted(() => ({ loads: [] as { provider: string; args: unknown[] }[], stops: [] as string[] }));
const fake = (provider: string, purpose: Purpose) => (...args: unknown[]): TelemetryAdapter => {
  calls.loads.push({ provider, args });
  return { purpose, async start() { /* a real adapter would inject its script here */ }, stop() { calls.stops.push(provider); } };
};
vi.mock("@/lib/telemetry/adapters/plausible", () => ({ plausible: fake("plausible", "analytics") }));
vi.mock("@/lib/telemetry/adapters/umami", () => ({ umami: fake("umami", "analytics") }));
vi.mock("@/lib/telemetry/adapters/ga4", () => ({ ga4: fake("ga4", "analytics") }));
vi.mock("@/lib/telemetry/adapters/firebaseAnalytics", () => ({ firebaseAnalytics: fake("firebase", "analytics") }));
vi.mock("@/lib/telemetry/adapters/posthog", () => ({ posthog: fake("posthog", "analytics") }));
vi.mock("@/lib/telemetry/adapters/clarity", () => ({ clarity: fake("clarity", "replay") }));
vi.mock("@/lib/telemetry/adapters/sentry", () => ({ sentry: fake("sentry", "diagnostics") }));
vi.mock("@/lib/telemetry/adapters/firebasePerformance", () => ({ firebasePerformance: fake("firebase_performance", "diagnostics") }));
vi.mock("@/lib/telemetry/adapters/mixpanel", () => ({ mixpanel: fake("mixpanel", "analytics") }));

const base = (patch: (value: WebTelemetryConfig) => void) => {
  const value = emptyTelemetryConfig();
  value.firebase = { apiKey: "fake-key", authDomain: "fake.firebaseapp.com", projectId: "fake-proj", appId: "1:1:web:fake", measurementId: "G-FAKEFB" };
  patch(value);
  return value;
};
const off = { analytics: false, replay: false, diagnostics: false };
const CASES: { name: string; provider: string; purpose: Purpose; config: WebTelemetryConfig; id: unknown }[] = [
  { name: "Plausible", provider: "plausible", purpose: "analytics", id: "fake.example", config: base((c) => { c.pageview = { provider: "plausible", siteId: "fake.example", endpoint: "" }; }) },
  { name: "Umami", provider: "umami", purpose: "analytics", id: "00000000-fake", config: base((c) => { c.pageview = { provider: "umami", siteId: "00000000-fake", endpoint: "https://umami.fake.example" }; }) },
  { name: "GA4", provider: "ga4", purpose: "analytics", id: "G-FAKE123", config: base((c) => { c.pageview = { provider: "ga4", siteId: "G-FAKE123", endpoint: "" }; }) },
  { name: "Firebase Analytics", provider: "firebase", purpose: "analytics", id: expect.objectContaining({ measurementId: "G-FAKEFB" }), config: base((c) => { c.pageview = { provider: "firebase", siteId: "", endpoint: "" }; }) },
  { name: "PostHog", provider: "posthog", purpose: "analytics", id: "phc_fake", config: base((c) => { c.pageview = { provider: "posthog", siteId: "phc_fake", endpoint: "" }; }) },
  { name: "Clarity", provider: "clarity", purpose: "replay", id: "fakeproj", config: base((c) => { c.replay = { provider: "clarity", siteId: "fakeproj", endpoint: "" }; }) },
  { name: "Sentry", provider: "sentry", purpose: "diagnostics", id: "https://fakekey@o0.ingest.sentry.io/0", config: base((c) => { c.diagnostics.sentry = { enabled: true, dsn: "https://fakekey@o0.ingest.sentry.io/0", sampleRate: 0.5 }; }) },
  { name: "Firebase Performance", provider: "firebase_performance", purpose: "diagnostics", id: expect.objectContaining({ projectId: "fake-proj" }), config: base((c) => { c.diagnostics.firebasePerformance = { enabled: true, sampleRate: 0.1 }; }) },
];
const grant = (purpose: Purpose) => ({ ...off, [purpose]: true });
const start = (controller: TelemetryController, config: WebTelemetryConfig, consent: typeof off, path = "/about", mixpanel = null as null | { token: string; apiHost: string; sdkHost: string }) => {
  history.replaceState(null, "", path);
  // As in the runtime, providers see the approved template, never the raw path.
  const template = analyticsTemplate(new URL(location.href)) ?? path;
  return controller.start(new URL(location.href), consent, providerFactories(config, consent, template, mixpanel), () => true);
};

beforeEach(() => { calls.loads.length = 0; calls.stops.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe.each(CASES)("$name", ({ provider, purpose, config, id }) => {
  it("loads nothing and touches no script, request, cookie or storage before consent", async () => {
    const fetcher = vi.spyOn(window, "fetch"), scripts = document.scripts.length, cookie = document.cookie;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await start(new TelemetryController(), config, off);
    expect(calls.loads).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.scripts.length).toBe(scripts);
    expect(document.cookie).toBe(cookie);
    expect(localStorage.length).toBe(0);
  });

  it("loads with the configured id once its own purpose is granted, and not for another purpose", async () => {
    const other = (["analytics", "replay", "diagnostics"] as Purpose[]).find((item) => item !== purpose)!;
    await start(new TelemetryController(), config, grant(other));
    expect(calls.loads).toEqual([]);
    await start(new TelemetryController(), config, grant(purpose));
    expect(calls.loads.map((item) => item.provider)).toEqual([provider]);
    expect(calls.loads[0].args[0]).toEqual(id);
  });

  it("stops the adapter when the visitor withdraws", async () => {
    const controller = new TelemetryController();
    await start(controller, config, grant(purpose));
    expect(calls.stops).toEqual([]);
    controller.stop();
    expect(calls.stops).toEqual([provider]);
  });
});

describe("Mixpanel", () => {
  const mixpanel = { token: "fake_token", apiHost: "https://api.mixpanel.com", sdkHost: "https://cdn.mxpnl.com" };
  it("replaces the configured page-analytics provider and still needs analytics consent", async () => {
    const config = CASES.find((item) => item.provider === "ga4")!.config;
    await start(new TelemetryController(), config, off, "/about", mixpanel);
    expect(calls.loads).toEqual([]);
    await start(new TelemetryController(), config, grant("analytics"), "/about", mixpanel);
    expect(calls.loads.map((item) => item.provider)).toEqual(["mixpanel"]);
    expect(calls.loads[0].args[0]).toEqual(mixpanel);
  });
});

describe("replay routes", () => {
  const clarity = CASES.find((item) => item.provider === "clarity")!.config;
  const posthogReplay = base((c) => { c.replay = { provider: "posthog", siteId: "phc_fake", endpoint: "" }; });
  it("runs Clarity on /about and PostHog replay on the public set", async () => {
    await start(new TelemetryController(), clarity, grant("replay"), "/about");
    expect(calls.loads.map((item) => item.provider)).toEqual(["clarity"]);
    calls.loads.length = 0;
    await start(new TelemetryController(), posthogReplay, grant("replay"), "/o/acme");
    expect(calls.loads.map((item) => item.provider)).toEqual(["posthog"]);
  });

  it("never starts replay on the join form or on private, token or unknown routes", async () => {
    for (const path of ["/o/acme/join/annual", "/dashboard", "/login", "/account", "/pay/tok", "/verify/tok", "/join/org/tok", "/start", "/super-admin"]) {
      for (const config of [clarity, posthogReplay]) expect(providerFactories(config, grant("replay"), path)).toHaveLength(0);
    }
  });

  it("allows page analytics, but not Clarity, on the join form", async () => {
    const ga4 = CASES.find((item) => item.provider === "ga4")!.config;
    expect(providerFactories(ga4, grant("analytics"), "/o/acme/join/annual")).toHaveLength(1);
    expect(providerFactories(clarity, grant("replay"), "/o/acme/join/annual")).toHaveLength(0);
  });
});

describe("controller", () => {
  const ga4 = CASES.find((item) => item.provider === "ga4")!.config;
  it("never imports an adapter for a URL with a query or fragment", async () => {
    for (const path of ["/about?x=1", "/about#team"]) await start(new TelemetryController(), ga4, grant("analytics"), path);
    expect(calls.loads).toEqual([]);
  });

  it("does not load when the document is no longer current", async () => {
    history.replaceState(null, "", "/about");
    await new TelemetryController().start(new URL(location.href), grant("analytics"), providerFactories(ga4, grant("analytics"), "/about"), () => false);
    expect(calls.loads).toEqual([]);
  });

  it("stops a provider that was admitted when the visitor leaves the approved routes", async () => {
    const controller = new TelemetryController();
    await start(controller, ga4, grant("analytics"));
    expect(calls.loads).toHaveLength(1);
    history.replaceState(null, "", "/dashboard");
    await controller.start(new URL(location.href), grant("analytics"), providerFactories(ga4, grant("analytics"), "/about"), () => true);
    expect(calls.stops).toEqual(["ga4"]);
    expect(calls.loads).toHaveLength(1);
  });
});
