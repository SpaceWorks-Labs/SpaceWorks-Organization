import type { Condition } from "./schema";

/** Every grouping value id a condition names, anywhere in its tree. Pure, so tests and readers can share it. */
export function conditionValueIds(condition: Condition): string[] {
  if (condition.type === "and" || condition.type === "or") return condition.items.flatMap(conditionValueIds);
  if (condition.type === "not") return conditionValueIds(condition.item);
  return condition.type === "grouping" ? [...condition.valueIds] : [];
}
