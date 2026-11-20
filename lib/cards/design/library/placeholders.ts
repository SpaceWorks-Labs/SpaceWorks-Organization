import { LAYER_PLACEHOLDERS } from "../layers";

/*
 * The text placeholders to offer in the designer, each with its label. Unit placeholders follow the
 * organisation's levels: one per named level ("Area", "Unit"), and none when it has no units. Unknown
 * levels read "Level 1"…. Placeholders added to LAYER_PLACEHOLDERS later still appear, named from
 * their key.
 */

const LABELS: Record<string, string> = {
  name: "Name", role: "Role", plan: "Plan", number: "Card number", validUntil: "Valid until", unit: "Unit", unitCode: "Unit code", units: "All units",
  organisation: "Organisation", website: "Website", email: "Email", phone: "Phone", contact: "Contact details",
};

const UNIT_KEYS = new Set(["unit", "unitCode", "units"]);
const fromKey = (key: string) => {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export type PlaceholderOption = { key: string; label: string };

export function placeholderOptions(unitLevels: readonly string[] | undefined): PlaceholderOption[] {
  return (LAYER_PLACEHOLDERS as readonly string[]).flatMap((key) => {
    const level = /^level(\d)$/.exec(key);
    if (level) {
      const index = Number(level[1]) - 1;
      if (unitLevels && index >= unitLevels.length) return [];
      return [{ key, label: unitLevels?.[index] ?? `Level ${index + 1}` }];
    }
    if (UNIT_KEYS.has(key) && unitLevels?.length === 0) return [];
    return [{ key, label: LABELS[key] ?? fromKey(key) }];
  });
}
