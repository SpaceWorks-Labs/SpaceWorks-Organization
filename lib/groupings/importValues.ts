/**
 * Matching imported grouping cells to values. Pure and client-safe: the preview and the import run the same rule,
 * so a cell the preview flags is a cell the import refuses.
 */

export type GroupingLookup = Map<string, { id: string; name: string; multiple: boolean; values: Array<{ id: string; label: string; code: string }> }>;
export type ImportedGrouping = { groupingId: string; valueIds: string[] };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One row's grouping cells as values: each cell names a value by its label or code (any case); a grouping that takes
 * several accepts several joined by ";". Returns an error naming the first cell that doesn't match.
 */
export function resolveImportGroupings(lookup: GroupingLookup | undefined, cells: Record<string, string>): { groupings: ImportedGrouping[] } | { error: string } {
  const groupings: ImportedGrouping[] = [];
  for (const [key, text] of Object.entries(cells)) {
    const grouping = lookup?.get(key);
    if (!grouping) return { error: `No grouping with the key "${key.slice(0, 40)}"` };
    const parts = [...new Set(text.split(";").map((part) => part.trim()).filter(Boolean))];
    if (!grouping.multiple && parts.length > 1) return { error: `${grouping.name} takes one value` };
    const valueIds: string[] = [];
    for (const part of parts) {
      const match = grouping.values.find((value) => same(value.label, part) || same(value.code, part));
      if (!match) return { error: `No ${grouping.name} value called "${part.slice(0, 40)}"` };
      valueIds.push(match.id);
    }
    groupings.push({ groupingId: grouping.id, valueIds });
  }
  return { groupings };
}
