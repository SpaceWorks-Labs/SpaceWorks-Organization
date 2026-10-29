import type { CardHolder } from "@/lib/cards/types";
import type { CardUnit } from "@/lib/cards/units";
import type { DesignerField } from "./SideSettings";

/** The sample member the designer previews cards with. */

export const SAMPLES = { latin: "Shaan Shoukath", malayalam: "ഷാൻ ഷൗക്കത്ത്", devanagari: "शान शौकत" } as const;
export type Sample = keyof typeof SAMPLES;

const SAMPLE_UNITS = [["North", "N"], ["North 1", "N1"], ["North 1 East", "N1E"], ["North 1 East A", "N1EA"]] as const;

/** The sample member's units, one per level the organisation names ("Area" and "Unit" when it hasn't said). */
function sampleUnits(levelNames: readonly string[] = ["Area", "Unit"]): CardUnit[] {
  return levelNames.slice(0, SAMPLE_UNITS.length).map((levelName, level) => ({ level, levelName, name: SAMPLE_UNITS[level]![0], code: SAMPLE_UNITS[level]![1] }));
}

/** The sample member's unit codes, for previewing a card number pattern. */
export function sampleNumberUnits(levelNames?: readonly string[]) {
  const units = sampleUnits(levelNames);
  return { unitCode: units.at(-1)?.code ?? null, unitCodes: units.map((unit) => unit.code) };
}

export function sampleHolder(name: string, planName: string, roleName: string, idNumber: string, fields: DesignerField[], levelNames?: readonly string[]): CardHolder {
  return {
    memberId: "sample",
    verifyToken: "sample",
    verifyUrl: "https://example.invalid/verify/sample-card",
    displayName: name,
    role: roleName || "Systems Engineer",
    planName: planName || "Annual member",
    details: fields.map((field) => ({ key: field.key, label: field.label, value: /blood/i.test(field.label) ? "O+" : /date|birth/i.test(field.label) ? "14 Feb 1998" : "Sample answer" })),
    photoUrl: null,
    idNumber,
    validUntil: "31 Mar 2027",
    units: sampleUnits(levelNames),
  };
}
