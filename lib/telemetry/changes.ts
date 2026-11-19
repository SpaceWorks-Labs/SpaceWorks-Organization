/** Dotted names of every field that differs, e.g. "pageview.provider". Names only, never the ids. */
export function changedFields(before: unknown, after: unknown, prefix = ""): string[] {
  if (before && after && typeof before === "object" && typeof after === "object") {
    return Object.keys(after).flatMap((key) => changedFields((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return Object.is(before, after) ? [] : [prefix];
}
