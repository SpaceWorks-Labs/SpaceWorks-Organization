/**
 * Mapping spreadsheet columns onto member details. Pure and client-safe, so the preview screen and the
 * import action agree on every rule.
 */

/** Where a column's values go. Custom plan questions use "field:<key>". */
export type ImportTarget = "skip" | "name" | "email" | "phone" | "state" | "unit" | "role" | `field:${string}`;

const ALIASES: Record<Exclude<ImportTarget, "skip" | `field:${string}`>, string[]> = {
  name: ["name", "full name", "member name", "member"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "mobile", "phone number", "mobile number", "contact", "whatsapp"],
  state: ["state", "state code", "region state"],
  unit: ["unit", "chapter", "branch", "district", "region"],
  role: ["role", "designation", "position", "title"],
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

/** Guess where each column goes from its header. Every target is used at most once. */
export function suggestMapping(headers: string[], fieldKeys: Array<{ key: string; label: string }>): ImportTarget[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const h = normalise(header);
    for (const [target, aliases] of Object.entries(ALIASES)) {
      if (!used.has(target) && aliases.some((alias) => normalise(alias) === h)) {
        used.add(target);
        return target as ImportTarget;
      }
    }
    const field = fieldKeys.find((entry) => normalise(entry.key) === h || normalise(entry.label) === h);
    if (field && !used.has(`field:${field.key}`)) {
      used.add(`field:${field.key}`);
      return `field:${field.key}` as ImportTarget;
    }
    return "skip";
  });
}

export type ImportRow = {
  name: string;
  email: string;
  phone: string | null;
  stateCode: string | null;
  unit: string | null;
  role: string | null;
  fieldValues: Record<string, string>;
};

/** One row's values by target. Returns an error message instead when the row can't be imported. */
export function readRow(cells: string[], mapping: ImportTarget[]): ImportRow | { error: string } {
  const value = (target: ImportTarget) => {
    const index = mapping.indexOf(target);
    return index >= 0 ? (cells[index] ?? "").trim() : "";
  };
  const email = value("email").toLowerCase();
  const name = value("name");
  if (!email) return { error: "No email address" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { error: "Email address isn't valid" };
  if (name.length < 2) return { error: "No name" };
  const fieldValues: Record<string, string> = {};
  mapping.forEach((target, index) => {
    if (target.startsWith("field:") && cells[index]?.trim()) fieldValues[target.slice(6)] = cells[index].trim().slice(0, 2000);
  });
  const state = value("state").toUpperCase();
  return {
    name: name.slice(0, 120),
    email,
    phone: value("phone").slice(0, 32) || null,
    stateCode: state || null,
    unit: value("unit") || null,
    role: value("role") || null,
    fieldValues,
  };
}

/** `questionKeys`: the keys of the questions columns may fill (every plan's, never sections). */
export function mappingIsUsable(mapping: ImportTarget[], questionKeys?: ReadonlySet<string>): string | null {
  if (!mapping.includes("email")) return "Choose which column holds the email address.";
  if (!mapping.includes("name")) return "Choose which column holds the name.";
  const chosen = mapping.filter((target) => target !== "skip");
  if (new Set(chosen).size !== chosen.length) return "Each detail can come from only one column.";
  if (questionKeys && chosen.some((target) => target.startsWith("field:") && !questionKeys.has(target.slice(6)))) return "Match columns only to questions a plan asks.";
  return null;
}
