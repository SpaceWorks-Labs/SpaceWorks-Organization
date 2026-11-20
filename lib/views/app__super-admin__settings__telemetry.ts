import { requireSuperAdmin } from "@/lib/permissions";
import { allowedTelemetryOrigins } from "@/lib/telemetry/env";
import { loadPlatformTelemetry } from "@/lib/telemetry/platform";
import type { WebTelemetryConfig } from "@/lib/telemetry/types";

/** The saved public ids, the origins the operator approved, and whether an env Mixpanel project is replacing page analytics. */
export async function loadWebTelemetrySettingsView(): Promise<{ initial: WebTelemetryConfig; allowedOrigins: string[]; mixpanelOn: boolean }> {
  await requireSuperAdmin();
  const { config, mixpanel } = await loadPlatformTelemetry();
  return { initial: config, allowedOrigins: allowedTelemetryOrigins(), mixpanelOn: mixpanel !== null };
}
