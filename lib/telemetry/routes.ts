/**
 * Route templates telemetry may report, as an allow-list. Anything else (tokens, pay, verify, sign-in, the
 * dashboard, the account area, the super-admin area, unknown paths) has no template and fails closed.
 * Segment matching only: there is no router in this module and it is safe to run in the edge runtime.
 */
export const PUBLIC_PAGE_TEMPLATES = ["/", "/about", "/features", "/docs", "/docs/:slug", "/organisations", "/o/:orgSlug", "/privacy", "/terms"] as const;
/** Allowed for page analytics only, never for replay: it carries a person's own join answers. */
export const ANALYTICS_ONLY_TEMPLATES = ["/o/:orgSlug/join/:planSlug"] as const;

const PARAM = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function matches(template: string, segments: string[]): boolean {
  const parts = template === "/" ? [] : template.slice(1).split("/");
  return parts.length === segments.length && parts.every((part, index) => (part.startsWith(":") ? PARAM.test(segments[index]) : part === segments[index]));
}

/** The approved template for a pathname, or null. One trailing slash is ignored; empty segments never match. */
export function templateForPath(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.includes("//")) return null;
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const segments = trimmed === "/" ? [] : trimmed.slice(1).split("/");
  return [...PUBLIC_PAGE_TEMPLATES, ...ANALYTICS_ONLY_TEMPLATES].find((template) => matches(template, segments)) ?? null;
}

/**
 * The template reported for a URL. A query string or fragment makes the URL unreportable (null) rather than
 * being stripped, so a page carrying `?unit=` or an unexpected token is never admitted.
 */
export function analyticsTemplate(url: URL): string | null {
  if (url.search || url.hash) return null;
  return templateForPath(url.pathname);
}

/** Any URL that is not a plain approved template is treated as a credential or private page. */
export const isBearerUrl = (url: URL) => analyticsTemplate(url) === null;

const CLARITY_REPLAY = new Set(["/about", "/features"]);
const POSTHOG_REPLAY = new Set<string>(PUBLIC_PAGE_TEMPLATES);

/** Replay runs only on anonymous public templates, and never on the join form. */
export function replayRoute(provider: string, template: string | null): boolean {
  if (!template) return false;
  if (provider === "posthog") return POSTHOG_REPLAY.has(template);
  return provider === "clarity" && CLARITY_REPLAY.has(template);
}
