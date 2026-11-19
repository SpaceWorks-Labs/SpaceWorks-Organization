import type { MixpanelConfig, WebTelemetryConfig } from "./types";
import type { Purpose } from "./policy";

export type ConfiguredProvider = { name: string; purpose: Purpose };

/** The providers an operator has switched on, by name and purpose (for the privacy page and the panel). */
export function configuredProviders(config: WebTelemetryConfig, mixpanel: MixpanelConfig | null): ConfiguredProvider[] {
  const names = { plausible: "Plausible", umami: "Umami", ga4: "Google Analytics 4", firebase: "Firebase Analytics", posthog: "PostHog", clarity: "Microsoft Clarity" } as const;
  const list: ConfiguredProvider[] = [];
  if (mixpanel) list.push({ name: "Mixpanel", purpose: "analytics" });
  else if (config.pageview.provider !== "none") list.push({ name: names[config.pageview.provider], purpose: "analytics" });
  if (config.replay.provider !== "none") list.push({ name: names[config.replay.provider], purpose: "replay" });
  if (config.diagnostics.sentry.enabled) list.push({ name: "Sentry", purpose: "diagnostics" });
  if (config.diagnostics.firebasePerformance.enabled) list.push({ name: "Firebase Performance", purpose: "diagnostics" });
  return list;
}

export const isConfigured = (config: WebTelemetryConfig, mixpanel: MixpanelConfig | null) => configuredProviders(config, mixpanel).length > 0;

/** Which of the three purposes have a provider behind them. */
export const configuredPurposes = (config: WebTelemetryConfig, mixpanel: MixpanelConfig | null): Purpose[] =>
  (["analytics", "replay", "diagnostics"] as const).filter((purpose) => configuredProviders(config, mixpanel).some((item) => item.purpose === purpose));
