import type { CardHolder } from "@/lib/cards/types";
import type { DesignerField } from "./SideSettings";

/** The sample member the designer previews cards with. */

export const SAMPLES = { latin: "Shaan Shoukath", malayalam: "ഷാൻ ഷൗക്കത്ത്", devanagari: "शान शौकत" } as const;
export type Sample = keyof typeof SAMPLES;

export function sampleHolder(name: string, planName: string, roleName: string, idNumber: string, fields: DesignerField[]): CardHolder {
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
  };
}
