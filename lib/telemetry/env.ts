import type { MixpanelConfig } from "./types";

/** Pure and edge-safe: the proxies read only this, never the database. */
const ORIGIN = /^https:\/\/[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*(?::[0-9]{1,5})?$/;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

export const isBareHttpsOrigin = (value: string) => ORIGIN.test(value);

/** `WEB_TELEMETRY_ALLOWED_ORIGINS`: comma-separated bare https origins. Anything else in the list is ignored. */
export function allowedTelemetryOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const items = (env.WEB_TELEMETRY_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return [...new Set(items.filter(isBareHttpsOrigin).map((item) => item.toLowerCase()))];
}

/** Off unless a valid token is set. Hosts default to Mixpanel's own and must be bare https origins. */
export function mixpanelFromEnv(env: Record<string, string | undefined> = process.env): MixpanelConfig | null {
  const token = env.WEB_TELEMETRY_MIXPANEL_TOKEN?.trim() ?? "";
  if (!TOKEN.test(token)) return null;
  const apiHost = env.WEB_TELEMETRY_MIXPANEL_API_HOST?.trim() || "https://api.mixpanel.com";
  const sdkHost = env.WEB_TELEMETRY_MIXPANEL_SDK_HOST?.trim() || "https://cdn.mxpnl.com";
  return isBareHttpsOrigin(apiHost) && isBareHttpsOrigin(sdkHost) ? { token, apiHost: apiHost.toLowerCase(), sdkHost: sdkHost.toLowerCase() } : null;
}
