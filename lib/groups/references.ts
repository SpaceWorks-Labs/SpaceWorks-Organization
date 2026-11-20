import "server-only";

import { prisma } from "@/lib/db";
import type { Condition } from "./schema";

function collect(condition: Condition, into: { plans: Set<string>; units: Set<string>; values: Map<string, Set<string>> }) {
  if (condition.type === "and" || condition.type === "or") for (const item of condition.items) collect(item, into);
  else if (condition.type === "not") collect(condition.item, into);
  else if (condition.type === "plan") for (const id of condition.planIds) into.plans.add(id);
  else if (condition.type === "unit") for (const id of condition.unitIds) into.units.add(id);
  else if (condition.type === "grouping") {
    const set = into.values.get(condition.groupingId) ?? new Set<string>();
    for (const id of condition.valueIds) set.add(id);
    into.values.set(condition.groupingId, set);
  }
}

/**
 * A message when the condition names a plan, unit, grouping or value that isn't this organisation's, else null.
 * A saved condition therefore never points at another organisation's data.
 */
export async function referenceProblem(organisationId: string, condition: Condition): Promise<string | null> {
  const found = { plans: new Set<string>(), units: new Set<string>(), values: new Map<string, Set<string>>() };
  collect(condition, found);
  if (found.plans.size && (await prisma.membershipPlan.count({ where: { organisationId, id: { in: [...found.plans] } } })) !== found.plans.size) return "One of those plans no longer exists.";
  if (found.units.size && (await prisma.orgUnit.count({ where: { organisationId, id: { in: [...found.units] } } })) !== found.units.size) return "One of those units no longer exists.";
  for (const [groupingId, ids] of found.values) {
    if ((await prisma.orgGroupingValue.count({ where: { organisationId, groupingId, id: { in: [...ids] } } })) !== ids.size) return "One of those grouping values no longer exists.";
  }
  return null;
}
