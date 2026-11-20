/** Pure helpers for groupings and their values. Client-safe. */

export const GROUPING_KINDS = ["list", "tree"] as const;
export type GroupingKind = (typeof GROUPING_KINDS)[number];

export const MAX_GROUPINGS = 30;
export const MAX_GROUPING_VALUES = 1000;
/** Tree depth: a value may sit up to this many levels below the top (0 is the top). */
export const MAX_VALUE_LEVEL = 5;
const CODE_MAX = 12;

/** A grouping's key: lowercase letters, digits and underscores, starting with a letter, at most 32. */
export function groupingKeyBase(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "g_$1").slice(0, 28);
  return base || "grouping";
}

/** The first key from `base` not in `taken` (profession, profession_2, ...). */
export function firstFreeKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A value's code: 1 to 12 of A-Z and 0-9. */
export const VALUE_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

export function normaliseValueCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_MAX);
}

/** The starting code for a value: its label's letters and digits, upper-cased. */
export function valueCodeBase(label: string): string {
  return normaliseValueCode(label) || "V";
}

/** The first code from `base` not in `taken` (DOCTORS, DOCTOR2, ...), shortened to fit the number. */
export function firstFreeValueCode(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = String(n);
    const candidate = `${base.slice(0, CODE_MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Answers for a multi-valued grouping travel as value ids joined by ";" (ids never contain one). */
export const encodeValueIds = (ids: readonly string[]): string => ids.join(";");
export const decodeValueIds = (text: unknown): string[] =>
  typeof text === "string" ? [...new Set(text.split(";").map((part) => part.trim()).filter(Boolean))] : Array.isArray(text) ? [...new Set(text.filter((part): part is string => typeof part === "string"))] : [];

export type ValueNode = { id: string; parentId: string | null; label: string; code: string; sortOrder: number; archivedAt?: Date | string | null };
export type FlatValue = ValueNode & { level: number };

/** Values in tree order (parents before their children, siblings by sort order then label) with their depth. */
export function flattenValues<T extends ValueNode>(values: readonly T[]): Array<T & { level: number }> {
  const children = new Map<string | null, T[]>();
  const ids = new Set(values.map((value) => value.id));
  for (const value of values) {
    const parent = value.parentId && ids.has(value.parentId) ? value.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), value]);
  }
  const out: Array<T & { level: number }> = [];
  const walk = (parent: string | null, level: number) => {
    const siblings = [...(children.get(parent) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    for (const value of siblings) {
      out.push({ ...value, level });
      walk(value.id, level + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A label drawn with its depth, for a select ("— — Cardiology"). */
export const indentedLabel = (label: string, level: number) => `${"— ".repeat(level)}${label}`;
