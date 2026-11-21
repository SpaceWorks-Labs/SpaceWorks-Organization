import { fillLayerText } from "@/lib/cards/design/layers";
import { placeholderOptions, type PlaceholderOption } from "@/lib/cards/design/library/placeholders";
import type { CardHolder } from "@/lib/cards/types";
import { fillCertificateText, type CertificateTextValues } from "@/lib/certificates/placeholders";

/*
 * The placeholders a certificate's text can hold, as chips (lib/certificates/placeholders.ts lists them): the
 * certificate's own first, then the card ones that make sense on a certificate (unit levels follow the
 * organisation's own names, contact details are the organisation's).
 */

const OWN: PlaceholderOption[] = [
  { key: "member.name", label: "Member name" },
  { key: "member.number", label: "Member number" },
  { key: "certificate.number", label: "Certificate number" },
  { key: "title", label: "Title" },
  { key: "reason", label: "Reason or citation" },
  { key: "date", label: "Date issued" },
  { key: "plan", label: "Plan" },
  { key: "organisation", label: "Organisation" },
];

const FROM_CARDS = new Set(["unit", "unitCode", "units", "level1", "level2", "level3", "level4", "website", "email", "phone", "contact"]);

export function certificatePlaceholderOptions(unitLevels: readonly string[]): PlaceholderOption[] {
  return [...OWN, ...placeholderOptions(unitLevels).filter((option) => FROM_CARDS.has(option.key))];
}

/** What a placeholder prints for the sample member, as the designer's preview draws it. */
export function samplePlaceholderValue(key: string, sample: { holder: CardHolder; values: CertificateTextValues }) {
  return fillLayerText(fillCertificateText(`{${key}}`, sample.values), sample.holder);
}
