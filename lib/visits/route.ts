import { ANALYTICS_ONLY_TEMPLATES, PUBLIC_PAGE_TEMPLATES } from "@/lib/telemetry/routes";

/** Pure and edge-safe. A visit names an approved route template, never a path: tokens and private routes have none. */
const TEMPLATES: readonly string[] = [...PUBLIC_PAGE_TEMPLATES, ...ANALYTICS_ONLY_TEMPLATES];
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const MAX_VISIT_BODY = 1024;

export type VisitRequest = { route: string; orgSlug: string | null };

/**
 * The visit in a beacon body (JSON, whether sent as JSON or as the text a sendBeacon carries), or null when it is
 * not an approved public template. Templates under /o/ need an organisation slug; the rest ignore any slug.
 */
export function parseVisit(raw: string): VisitRequest | null {
  if (raw.length === 0 || raw.length > MAX_VISIT_BODY) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { route, orgSlug } = value as { route?: unknown; orgSlug?: unknown };
  if (typeof route !== "string" || !TEMPLATES.includes(route)) return null;
  if (!route.startsWith("/o/")) return { route, orgSlug: null };
  return typeof orgSlug === "string" && SLUG.test(orgSlug) ? { route, orgSlug } : null;
}
