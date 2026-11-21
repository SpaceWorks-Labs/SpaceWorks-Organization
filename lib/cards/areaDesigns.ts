import { pathIds } from "./units";

/*
 * Area designs: a card design that belongs to one unit (an area) and covers its members and every unit
 * below it, until a nearer unit has a design of its own. Pure and client-safe.
 */

/**
 * The design row of the member's own unit, else of the nearest unit above it that has one. `unitPath` is the
 * member's unit path (ancestor ids joined by "/", ending with the unit's own id). Rows without a `unitId`
 * (organisation, plan and role designs) are ignored.
 */
export function nearestAreaDesign<T extends { unitId?: string | null }>(rows: readonly T[], unitPath: string | null | undefined): T | undefined {
  if (!unitPath) return undefined;
  const byUnit = new Map<string, T>();
  for (const row of rows) if (row.unitId) byUnit.set(row.unitId, row);
  if (byUnit.size === 0) return undefined;
  for (const id of pathIds(unitPath).reverse()) {
    const row = byUnit.get(id);
    if (row) return row;
  }
  return undefined;
}
