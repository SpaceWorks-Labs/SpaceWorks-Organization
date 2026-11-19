import { isConfigured } from "./configured";
import { allowedTelemetryOrigins } from "./env";
import { parseStoredTelemetry } from "./schema";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "./types";

/**
 * An organisation's effective telemetry from its saved row. Same schema and operator origin allow-list as the
 * platform's; Mixpanel is never available here (it is the operator's project, set in the environment). A saved
 * row that no longer validates, for example an origin the operator has since removed, counts as unset.
 */
export function parseOrgTelemetry(saved: unknown, allowed: readonly string[] = allowedTelemetryOrigins()): { config: WebTelemetryConfig; configured: boolean } {
  const config = (saved ? parseStoredTelemetry(saved, allowed) : null) ?? emptyTelemetryConfig();
  return { config, configured: isConfigured(config, null) };
}

/** The consent scope of an organisation's public pages. */
export const orgScopeId = (organisationId: string) => `org:${organisationId}`;

/**
 * Whether a telemetry instance runs at this path. The platform config covers every public page except under
 * /o/, and an organisation config covers only its own /o/ pages, so one page never runs two page-analytics providers.
 */
export const telemetryScopeApplies = (scope: "platform" | "org", pathname: string | null) => (scope === "org") === (pathname ?? "").startsWith("/o/");
