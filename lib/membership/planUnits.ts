/** Whether a unit path is the ancestor path itself or anywhere under it. */
export function pathWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/**
 * Whether a plan is offered to a member of this unit: open to every unit, or limited to units whose
 * subtree contains it (a plan limited to an area admits the members of that area's units). A member with no
 * unit gets only plans open to every unit.
 */
export function planOffersUnit(plan: { allUnits: boolean }, planUnitPaths: readonly string[], unitPath: string | null): boolean {
  return plan.allUnits || (unitPath !== null && planUnitPaths.some((ancestor) => pathWithin(unitPath, ancestor)));
}
