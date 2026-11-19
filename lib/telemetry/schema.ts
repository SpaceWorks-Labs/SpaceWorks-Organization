import { z } from "zod";
import type { WebTelemetryConfig } from "./types";

const siteId = z.string().max(128).regex(/^[A-Za-z0-9._:-]*$/);
const rate = z.number().min(0).max(1);

/** A bare https origin the operator listed. The canonical origin is stored, never the raw text. */
function approvedOrigin(value: string, allowed: readonly string[]): string | null {
  if (!value) return "";
  if (value !== value.trim() || /[\s\\?#]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return allowed.includes(url.origin) ? url.origin : null;
  } catch { return null; }
}

const ORIGIN_MESSAGE = "Use an https origin the operator has approved, with no path, query or credentials.";

/** The configuration the super admin may save. `allowed` is WEB_TELEMETRY_ALLOWED_ORIGINS. */
export function telemetrySchema(allowed: readonly string[]) {
  const endpoint = z.string().max(300).transform((value, ctx) => {
    const origin = approvedOrigin(value, allowed);
    if (origin === null) { ctx.addIssue({ code: "custom", message: ORIGIN_MESSAGE }); return z.NEVER; }
    return origin;
  });
  const choice = <P extends string>(providers: [P, ...P[]]) => z.strictObject({ provider: z.enum(providers), siteId, endpoint });
  const dsn = z.string().max(500).transform((value, ctx) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (value !== value.trim() || /[\s\\?#]/.test(value) || url.protocol !== "https:" || url.password || !approvedOrigin(url.origin, allowed)
        || !/^[A-Za-z0-9]+$/.test(url.username) || !/^\/\d+$/.test(url.pathname)) throw new Error("invalid");
      return value;
    } catch {
      ctx.addIssue({ code: "custom", message: "Use the public Sentry DSN (public key and numeric project) on an approved https origin." });
      return z.NEVER;
    }
  });
  return z.strictObject({
    pageview: choice(["none", "plausible", "umami", "ga4", "firebase", "posthog"]),
    replay: choice(["none", "clarity", "posthog"]),
    diagnostics: z.strictObject({
      sentry: z.strictObject({ enabled: z.boolean(), dsn, sampleRate: rate }),
      firebasePerformance: z.strictObject({ enabled: z.boolean(), sampleRate: rate }),
    }),
    firebase: z.strictObject({
      apiKey: z.string().max(128).regex(/^[A-Za-z0-9_-]*$/),
      authDomain: z.string().max(253).regex(/^[A-Za-z0-9.-]*$/),
      projectId: z.string().max(63).regex(/^[a-z0-9-]*$/),
      appId: z.string().max(128).regex(/^[A-Za-z0-9:_-]*$/),
      measurementId: z.string().max(32).regex(/^(G-[A-Z0-9]+)?$/),
    }),
  }).superRefine((value, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const patterns: Record<string, RegExp> = {
      umami: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      posthog: /^phc_[A-Za-z0-9]+$/, clarity: /^[A-Za-z0-9]+$/, plausible: /^[A-Za-z0-9.-]+$/, ga4: /^G-[A-Z0-9]+$/,
    };
    for (const key of ["pageview", "replay"] as const) {
      const { provider, siteId: id, endpoint: origin } = value[key];
      if (provider === "none") { if (id || origin) fail([key, "siteId"], "Remove the identifier or choose a provider."); continue; }
      if (provider === "firebase") { if (id) fail([key, "siteId"], "For Firebase, use the measurement id in the Firebase settings."); continue; }
      if (!id) fail([key, "siteId"], "A selected provider needs an identifier.");
      else if (!patterns[provider]?.test(id)) fail([key, "siteId"], "That identifier is not valid for this provider.");
      if (provider === "umami" && !origin) fail([key, "endpoint"], "Umami needs an approved origin.");
      if (origin && !["plausible", "umami", "posthog"].includes(provider)) fail([key, "endpoint"], "This provider has a fixed host; leave the origin empty.");
    }
    const { pageview: page, replay, firebase, diagnostics } = value;
    if (page.provider === "firebase" && !firebase.measurementId) fail(["firebase", "measurementId"], "Required for Firebase Analytics.");
    const host = (origin: string) => origin || "https://us.i.posthog.com";
    if (page.provider === "posthog" && replay.provider === "posthog" && (page.siteId !== replay.siteId || host(page.endpoint) !== host(replay.endpoint))) {
      fail(["replay", "siteId"], "PostHog analytics and replay must use the same project and origin.");
    }
    if ((page.provider === "firebase" || diagnostics.firebasePerformance.enabled) && !(firebase.apiKey && firebase.projectId && firebase.appId)) {
      fail(["firebase", "apiKey"], "The Firebase API key, project id and app id are required.");
    }
    if (diagnostics.sentry.enabled && !diagnostics.sentry.dsn) fail(["diagnostics", "sentry", "dsn"], "Required when Sentry is on.");
  });
}

/** A stored row that no longer passes (for example an origin the operator removed) counts as not configured. */
export function parseStoredTelemetry(value: unknown, allowed: readonly string[]): WebTelemetryConfig | null {
  const parsed = telemetrySchema(allowed).safeParse(value);
  return parsed.success ? (parsed.data as WebTelemetryConfig) : null;
}
