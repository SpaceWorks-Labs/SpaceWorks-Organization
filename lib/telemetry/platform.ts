import "server-only";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { isConfigured } from "./configured";
import { allowedTelemetryOrigins, mixpanelFromEnv } from "./env";
import { parseStoredTelemetry } from "./schema";
import { emptyTelemetryConfig } from "./types";

/**
 * The platform's effective telemetry: the saved public ids (database) plus the operator's Mixpanel project (env).
 * A saved row that no longer validates, for example an origin the operator has since removed, counts as unset.
 */
export async function loadPlatformTelemetry() {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { webTelemetry: true } });
  const saved = row?.webTelemetry ? parseStoredTelemetry(row.webTelemetry, allowedTelemetryOrigins()) : null;
  const config = saved ?? emptyTelemetryConfig();
  const mixpanel = mixpanelFromEnv();
  return { config, saved: row?.webTelemetry ?? null, mixpanel, configured: isConfigured(config, mixpanel) };
}
