/** Contact details as an area or organisation stores them; empty strings count as not set. */
export type ContactSource = { contactEmail?: string | null; contactPhone?: string | null; website?: string | null };

export type Contact = { email: string | null; phone: string | null; website: string | null };

const value = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);

/**
 * The contact details for a member's area, each one taken from the nearest unit that sets it (`chain` runs from the
 * member's own unit up to the top level), else from the organisation. With no unit, the organisation's own.
 */
export function contactFor(chain: ReadonlyArray<ContactSource>, organisation: ContactSource): Contact {
  const pick = (key: keyof ContactSource) => {
    for (const unit of chain) {
      const found = value(unit[key]);
      if (found) return found;
    }
    return value(organisation[key]);
  };
  return { email: pick("contactEmail"), phone: pick("contactPhone"), website: pick("website") };
}

/**
 * Orders a unit and its ancestors nearest first, from the unit's `path` (ancestor ids joined by "/", ending with the
 * unit's own id) and the organisation's units. Units not found (archived or another organisation's) are skipped.
 */
export function unitChainNearestFirst<T extends { id: string; path: string }>(unit: { path: string } | null | undefined, units: ReadonlyArray<T>): T[] {
  if (!unit) return [];
  const byId = new Map(units.map((item) => [item.id, item]));
  return unit.path.split("/").filter(Boolean).reverse().map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}
