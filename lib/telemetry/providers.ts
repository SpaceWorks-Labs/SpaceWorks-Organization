import type { AdapterFactory } from "./controller";
import type { Consent } from "./policy";
import { replayRoute } from "./routes";
import type { MixpanelConfig, WebTelemetryConfig } from "./types";

/** Defence in depth behind the schema and the operator allow-list: a bare https origin, or nothing. */
export function safeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || /[\s\\]/.test(value)) return undefined;
    return url.origin;
  } catch { return undefined; }
}

const POSTHOG_HOST = "https://us.i.posthog.com";

/** Adapter modules are imported only inside `load`, which the controller calls after the purpose is admitted. */
export function providerFactories(config: WebTelemetryConfig, consent: Consent, path: string, mixpanel: MixpanelConfig | null = null): AdapterFactory[] {
  const result: AdapterFactory[] = [];
  // One page-analytics provider: an operator-selected Mixpanel project takes precedence.
  const p = mixpanel ? { ...config.pageview, provider: "none" as const } : config.pageview, r = config.replay, firebase = config.firebase;
  if (mixpanel) result.push({ purpose: "analytics", load: async () => (await import("./adapters/mixpanel")).mixpanel(mixpanel, path) });
  const pageOrigin = p.endpoint ? safeOrigin(p.endpoint) : undefined, replayOrigin = r.endpoint ? safeOrigin(r.endpoint) : undefined;
  const pageOriginOk = !p.endpoint || Boolean(pageOrigin), replayOriginOk = !r.endpoint || Boolean(replayOrigin);
  if (p.provider === "plausible" && pageOriginOk) result.push({ purpose: "analytics", load: async () => (await import("./adapters/plausible")).plausible(p.siteId, pageOrigin || "https://plausible.io", path) });
  if (p.provider === "umami" && pageOrigin) result.push({ purpose: "analytics", load: async () => (await import("./adapters/umami")).umami(p.siteId, pageOrigin, path) });
  if (p.provider === "ga4") result.push({ purpose: "analytics", load: async () => (await import("./adapters/ga4")).ga4(p.siteId, path) });
  if (p.provider === "firebase") result.push({ purpose: "analytics", load: async () => (await import("./adapters/firebaseAnalytics")).firebaseAnalytics(firebase, path) });
  const phAnalytics = p.provider === "posthog" && consent.analytics && pageOriginOk;
  const replayAllowed = replayRoute(r.provider, path);
  // One shared SDK instance: replay rides along only when it targets the very same project and origin.
  const sameProject = p.siteId === r.siteId && (pageOrigin || POSTHOG_HOST) === (replayOrigin || POSTHOG_HOST);
  const phReplay = r.provider === "posthog" && consent.replay && replayAllowed && replayOriginOk && (!phAnalytics || sameProject);
  if (phAnalytics || phReplay) result.push({ purpose: phAnalytics ? "analytics" : "replay", load: async () => {
    const [siteId, origin] = phAnalytics ? [p.siteId, pageOrigin] : [r.siteId, replayOrigin];
    return (await import("./adapters/posthog")).posthog(siteId, origin || POSTHOG_HOST, phAnalytics, phReplay, path);
  } });
  if (r.provider === "clarity" && replayAllowed) result.push({ purpose: "replay", load: async () => (await import("./adapters/clarity")).clarity(r.siteId) });
  const { sentry, firebasePerformance } = config.diagnostics;
  if (sentry.enabled) result.push({ purpose: "diagnostics", load: async () => (await import("./adapters/sentry")).sentry(sentry.dsn, sentry.sampleRate) });
  if (firebasePerformance.enabled) result.push({ purpose: "diagnostics", load: async () => (await import("./adapters/firebasePerformance")).firebasePerformance(firebase, firebasePerformance.sampleRate) });
  return result;
}
