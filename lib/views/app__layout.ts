import { auth } from "@/lib/auth";
import { loadPlatformTelemetry } from "@/lib/telemetry/platform";
import type { TelemetryView } from "@/lib/telemetry/types";

/**
 * The public telemetry configuration for the root layout. Only a visitor with no session gets it, so a signed-in
 * page never receives provider settings. `scopeId` is "platform"; an organisation scope can use `org:<id>` later.
 */
export async function loadWebTelemetryView(): Promise<TelemetryView | null> {
  const session = await auth();
  if (session?.user) return null;
  const { config, mixpanel, configured } = await loadPlatformTelemetry();
  return configured ? { scopeId: "platform", config, mixpanel } : null;
}
