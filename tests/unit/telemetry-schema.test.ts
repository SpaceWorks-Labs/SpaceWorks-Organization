import { describe, expect, it } from "vitest";
import { allowedTelemetryOrigins, mixpanelFromEnv } from "@/lib/telemetry/env";
import { parseStoredTelemetry, telemetrySchema } from "@/lib/telemetry/schema";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

const ALLOWED = ["https://umami.example.org", "https://us.i.posthog.com", "https://o0.ingest.sentry.io"];
const schema = telemetrySchema(ALLOWED);
const UUID = "00000000-0000-4000-8000-000000000000";

function config(patch: (value: WebTelemetryConfig) => void): WebTelemetryConfig {
  const value = emptyTelemetryConfig();
  patch(value);
  return value;
}
const ok = (value: unknown) => schema.safeParse(value).success;
const message = (value: unknown) => { const result = schema.safeParse(value); return result.success ? "" : result.error.issues[0].message; };

describe("telemetry configuration schema", () => {
  it("accepts the empty configuration and each provider with a fake id", () => {
    expect(ok(emptyTelemetryConfig())).toBe(true);
    expect(ok(config((c) => { c.pageview = { provider: "plausible", siteId: "example.org", endpoint: "" }; }))).toBe(true);
    expect(ok(config((c) => { c.pageview = { provider: "umami", siteId: UUID, endpoint: "https://umami.example.org" }; }))).toBe(true);
    expect(ok(config((c) => { c.pageview = { provider: "ga4", siteId: "G-FAKE123", endpoint: "" }; }))).toBe(true);
    expect(ok(config((c) => { c.replay = { provider: "clarity", siteId: "abc123xyz", endpoint: "" }; }))).toBe(true);
    expect(ok(config((c) => { c.diagnostics.sentry = { enabled: true, dsn: "https://fakekey@o0.ingest.sentry.io/12", sampleRate: 0.5 }; }))).toBe(true);
  });

  it("has one page-analytics choice, so an identifier without a provider is refused", () => {
    expect(ok(config((c) => { c.pageview = { provider: "ga4", siteId: "G-FAKE", endpoint: "" }; c.firebase.measurementId = "G-OTHER"; }))).toBe(true);
    expect(message(config((c) => { c.pageview = { provider: "none", siteId: "G-FAKE", endpoint: "" }; }))).toMatch(/Remove the identifier/);
  });

  it("makes GA4 and Firebase Analytics mutually exclusive", () => {
    expect(message(config((c) => { c.pageview = { provider: "firebase", siteId: "G-FAKE", endpoint: "" }; }))).toMatch(/measurement id in the Firebase/);
    expect(message(config((c) => { c.pageview = { provider: "firebase", siteId: "", endpoint: "" }; }))).toMatch(/measurement id|Required/);
    expect(ok(config((c) => {
      c.pageview = { provider: "firebase", siteId: "", endpoint: "" };
      c.firebase = { apiKey: "fakekey", authDomain: "f.firebaseapp.com", projectId: "fake-proj", appId: "1:1:web:f", measurementId: "G-FAKEFB" };
    }))).toBe(true);
  });

  it("requires endpoints to be bare https origins on the operator allow-list", () => {
    const umami = (endpoint: string) => config((c) => { c.pageview = { provider: "umami", siteId: UUID, endpoint }; });
    expect(ok(umami("https://umami.example.org"))).toBe(true);
    expect(ok(umami("https://umami.example.org/"))).toBe(true);
    for (const bad of ["", "http://umami.example.org", "https://other.example.org", "https://umami.example.org/path", "https://umami.example.org?x=1",
      "https://user:pw@umami.example.org", "https://umami.example.org#a", " https://umami.example.org", "//umami.example.org"]) {
      expect(ok(umami(bad)), bad).toBe(false);
    }
  });

  it("stores the canonical origin, not the raw text", () => {
    const result = schema.parse(config((c) => { c.pageview = { provider: "umami", siteId: UUID, endpoint: "https://umami.example.org/" }; }));
    expect(result.pageview.endpoint).toBe("https://umami.example.org");
  });

  it("rejects secrets and unknown keys", () => {
    for (const extra of ["apiSecret", "serviceAccount", "secret", "token", "password", "privateKey"]) {
      expect(ok({ ...emptyTelemetryConfig(), [extra]: "x" }), extra).toBe(false);
      const nested = emptyTelemetryConfig();
      expect(ok({ ...nested, firebase: { ...nested.firebase, [extra]: "x" } }), `firebase.${extra}`).toBe(false);
      expect(ok({ ...nested, pageview: { ...nested.pageview, [extra]: "x" } }), `pageview.${extra}`).toBe(false);
    }
  });

  it("validates identifiers per provider", () => {
    expect(ok(config((c) => { c.pageview = { provider: "ga4", siteId: "UA-1", endpoint: "" }; }))).toBe(false);
    expect(ok(config((c) => { c.pageview = { provider: "posthog", siteId: "sk_secret", endpoint: "" }; }))).toBe(false);
    expect(ok(config((c) => { c.pageview = { provider: "umami", siteId: "not-a-uuid", endpoint: "https://umami.example.org" }; }))).toBe(false);
    expect(ok(config((c) => { c.pageview = { provider: "plausible", siteId: "", endpoint: "" }; }))).toBe(false);
    expect(ok(config((c) => { c.pageview = { provider: "ga4", siteId: "G-FAKE", endpoint: "https://umami.example.org" }; }))).toBe(false);
  });

  it("requires PostHog analytics and replay to share one project and origin", () => {
    const posthog = (siteId: string) => config((c) => {
      c.pageview = { provider: "posthog", siteId: "phc_one", endpoint: "" };
      c.replay = { provider: "posthog", siteId, endpoint: "" };
    });
    expect(ok(posthog("phc_one"))).toBe(true);
    expect(message(posthog("phc_two"))).toMatch(/same project and origin/);
  });

  it("checks the Sentry DSN and the Firebase requirements", () => {
    const sentry = (dsn: string, enabled = true) => config((c) => { c.diagnostics.sentry = { enabled, dsn, sampleRate: 1 }; });
    expect(ok(sentry("https://fakekey@o0.ingest.sentry.io/12"))).toBe(true);
    expect(ok(sentry("https://fakekey:secret@o0.ingest.sentry.io/12"))).toBe(false);
    expect(ok(sentry("https://fakekey@elsewhere.example.org/12"))).toBe(false);
    expect(ok(sentry("https://fakekey@o0.ingest.sentry.io/project"))).toBe(false);
    expect(ok(sentry("", true))).toBe(false);
    expect(ok(config((c) => { c.diagnostics.firebasePerformance = { enabled: true, sampleRate: 0.1 }; }))).toBe(false);
    expect(ok(config((c) => { c.diagnostics.firebasePerformance = { enabled: true, sampleRate: 2 }; }))).toBe(false);
  });

  it("treats a stored row that no longer passes the allow-list as unset", () => {
    const stored = config((c) => { c.pageview = { provider: "umami", siteId: UUID, endpoint: "https://umami.example.org" }; });
    expect(parseStoredTelemetry(stored, ALLOWED)).toEqual(stored);
    expect(parseStoredTelemetry(stored, [])).toBeNull();
    expect(parseStoredTelemetry("junk", ALLOWED)).toBeNull();
  });
});

describe("telemetry environment", () => {
  it("keeps only bare https origins from the allow-list", () => {
    expect(allowedTelemetryOrigins({ WEB_TELEMETRY_ALLOWED_ORIGINS: " https://a.example.org , http://b.example.org,https://c.example.org/x,https://*.d.org,https://A.example.org" }))
      .toEqual(["https://a.example.org"]);
    expect(allowedTelemetryOrigins({})).toEqual([]);
  });

  it("is off without a token and refuses bad hosts", () => {
    expect(mixpanelFromEnv({})).toBeNull();
    expect(mixpanelFromEnv({ WEB_TELEMETRY_MIXPANEL_TOKEN: "bad token" })).toBeNull();
    expect(mixpanelFromEnv({ WEB_TELEMETRY_MIXPANEL_TOKEN: "tok_1", WEB_TELEMETRY_MIXPANEL_API_HOST: "http://api.example.org" })).toBeNull();
    expect(mixpanelFromEnv({ WEB_TELEMETRY_MIXPANEL_TOKEN: "tok_1" })).toEqual({ token: "tok_1", apiHost: "https://api.mixpanel.com", sdkHost: "https://cdn.mxpnl.com" });
    expect(mixpanelFromEnv({ WEB_TELEMETRY_MIXPANEL_TOKEN: "tok_1", WEB_TELEMETRY_MIXPANEL_API_HOST: "https://api-eu.mixpanel.com" })?.apiHost).toBe("https://api-eu.mixpanel.com");
  });
});
