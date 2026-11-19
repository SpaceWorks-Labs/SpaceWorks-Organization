/** Public-only telemetry configuration (product rules §8.2). Ids and origins only; never a secret. */
export type PageProvider = "none" | "plausible" | "umami" | "ga4" | "firebase" | "posthog";
export type ReplayProvider = "none" | "clarity" | "posthog";
export type ProviderChoice<P extends string> = { provider: P; siteId: string; endpoint: string };
export type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string; measurementId: string };

export type WebTelemetryConfig = {
  pageview: ProviderChoice<PageProvider>;
  replay: ProviderChoice<ReplayProvider>;
  diagnostics: {
    sentry: { enabled: boolean; dsn: string; sampleRate: number };
    firebasePerformance: { enabled: boolean; sampleRate: number };
  };
  firebase: FirebaseConfig;
};

/** Operator project from the environment (never the database); replaces the page-analytics provider while set. */
export type MixpanelConfig = { token: string; apiHost: string; sdkHost: string };

/**
 * What a signed-out visitor's page receives. `scopeId` is "platform" today; a later organisation scope uses
 * `org:<organisationId>` and the same shape, so consent, boundary binding and the controller need no change.
 */
export type TelemetryView = { scopeId: string; config: WebTelemetryConfig; mixpanel: MixpanelConfig | null };

export const emptyTelemetryConfig = (): WebTelemetryConfig => ({
  pageview: { provider: "none", siteId: "", endpoint: "" },
  replay: { provider: "none", siteId: "", endpoint: "" },
  diagnostics: { sentry: { enabled: false, dsn: "", sampleRate: 1 }, firebasePerformance: { enabled: false, sampleRate: 0.1 } },
  firebase: { apiKey: "", authDomain: "", projectId: "", appId: "", measurementId: "" },
});

/** Every event carries which client sent it; the mobile apps send "ios" or "android" with the same names. */
export const TELEMETRY_CLIENT = "web" as const;
