/** Pure helpers for unit codes and level templates. Client-safe. */

const UNIT_CODE_MAX = 6;

/** Ready-made level names an organisation can start from; every name stays editable. */
export const UNIT_LEVEL_TEMPLATES: ReadonlyArray<{ label: string; levels: string[] }> = [
  { label: "Area and unit", levels: ["Area", "Unit"] },
  { label: "State, district and chapter", levels: ["State", "District", "Chapter"] },
  { label: "Branches only", levels: ["Branch"] },
];

/** The starting point for a unit's code: its name's letters and digits, upper-cased, at most six. */
export function unitCodeBase(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, UNIT_CODE_MAX) || "U";
}

/** The first code from `base` not in `taken`: the base, then the base shortened to fit a number (AB2, AB3…). */
export function firstFreeUnitCode(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = String(n);
    const candidate = `${base.slice(0, UNIT_CODE_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
