/**
 * The landing switch (product rules §12.1 and §12.2). LANDING_ENABLED is read on the server at request time and
 * is on unless set to an off word. When it is off, "/" follows the data: exactly one public organisation opens
 * its page, several open the directory, and none, or a failed lookup, opens sign-in.
 */

const OFF = new Set(["0", "false", "off", "no"]);

/** Whether "/" shows the landing page. Unset, empty or anything but an off word means on. */
export function isLandingEnabled(value: string | undefined = process.env.LANDING_ENABLED): boolean {
  return !OFF.has((value ?? "").trim().toLowerCase());
}

/** What the public directory says exists: the first page of public, active organisations and their total. */
export type PublicOrganisations = { total: number; organisations: ReadonlyArray<{ slug: string }> };

/**
 * Where "/" sends a visitor when the landing page is off. `lookup` must list only public, active organisations
 * (the directory's own reader, lib/views/app__organisations__page.ts), so an unlisted or suspended one is
 * never opened from here.
 */
export async function entryTarget(lookup: () => Promise<PublicOrganisations>): Promise<string> {
  try {
    const { total, organisations } = await lookup();
    if (total === 1 && organisations[0]?.slug) return `/o/${encodeURIComponent(organisations[0].slug)}`;
    if (total > 1) return "/organisations";
    return "/login";
  } catch {
    return "/login";
  }
}
