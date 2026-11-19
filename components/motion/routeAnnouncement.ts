type PageState = { pathname: string; title: string };

/**
 * What RouteAnnouncer says after a navigation (pure, unit-tested): nothing on the first load (screen readers read the
 * page), nothing for the same path, nothing when the title changed (Next.js announces those itself), otherwise the
 * page's heading with whitespace collapsed, falling back to the title.
 */
export function pageAnnouncement(before: PageState | null, now: PageState & { heading: string }): string | null {
  if (!before || before.pathname === now.pathname) return null;
  if (before.title !== now.title) return null;
  const heading = now.heading.replace(/\s+/g, " ").trim();
  return heading || now.title || null;
}
