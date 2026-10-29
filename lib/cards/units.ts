/*
 * The member's place in the organisation's hierarchy, as a card prints it: their unit and its
 * ancestors, top level first, each with the organisation's name for that level ("Area", "Unit").
 * Read live like the rest of a card, so moving a member or renaming a unit shows on the next render;
 * card numbers are different and keep the codes they were issued with (lib/cards/numbering.ts).
 * Pure and client-safe.
 */

/** One unit in a member's chain. `level` 0 is the top. */
export type CardUnit = { level: number; levelName: string; name: string; code: string };

/** The unit columns a chain is built from. `path` is the ancestor ids and the unit's own, joined by "/". */
export type CardUnitRow = { id: string; name: string; code: string; level: number; path: string };

/** Unit chains go at most this deep (Organisation.unitLevels has up to four names). */
const MAX_UNIT_LEVELS = 4;

/** The ids of a unit and all its ancestors. */
export function pathIds(path: string) {
  return path.split("/").filter(Boolean);
}

/** The ancestor ids of `units` that `known` doesn't hold yet, once each. */
export function missingAncestorIds(units: ReadonlyArray<Pick<CardUnitRow, "path">>, known: ReadonlyMap<string, unknown>) {
  return [...new Set(units.flatMap((unit) => pathIds(unit.path)))].filter((id) => !known.has(id));
}

/**
 * The chain for a member's unit, top level first. Ancestors come from `known` by the ids in the unit's
 * path; one that can't be found is left out rather than guessed. A level with no name in `levelNames`
 * reads "Unit".
 */
export function unitChain(unit: CardUnitRow | null | undefined, known: ReadonlyMap<string, CardUnitRow>, levelNames: readonly string[]): CardUnit[] {
  if (!unit) return [];
  return pathIds(unit.path)
    .map((id) => (id === unit.id ? unit : known.get(id)))
    .filter((row): row is CardUnitRow => Boolean(row))
    .sort((a, b) => a.level - b.level)
    .slice(0, MAX_UNIT_LEVELS)
    .map((row) => ({ level: row.level, levelName: levelNames[row.level]?.trim() || "Unit", name: row.name, code: row.code }));
}

/** The member's own unit: the deepest one in the chain. */
export function ownUnit(chain: readonly CardUnit[] | undefined) {
  return chain && chain.length > 0 ? chain[chain.length - 1]! : null;
}

/** The unit at `level` (0 = top) in the chain, if the member has one there. */
export function unitAtLevel(chain: readonly CardUnit[] | undefined, level: number) {
  return chain?.find((unit) => unit.level === level) ?? null;
}
