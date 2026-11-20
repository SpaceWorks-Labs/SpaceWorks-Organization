import { configuredProviders, type ConfiguredProvider } from "@/lib/telemetry/configured";
import { loadPlatformTelemetry } from "@/lib/telemetry/platform";

/** Provider names and purposes the operator has switched on, for the privacy page. Public, and no ids. */
export async function loadPrivacyTelemetryView(): Promise<{ providers: ConfiguredProvider[] }> {
  const { config, mixpanel } = await loadPlatformTelemetry();
  return { providers: configuredProviders(config, mixpanel) };
}
