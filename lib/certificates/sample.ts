import type { CardHolder } from "@/lib/cards/types";
import type { CardUnit } from "@/lib/cards/units";
import { formatCalendarDate } from "@/lib/membership/periods";
import type { CertificateTextValues } from "./placeholders";

/*
 * The member a certificate designer previews a design with when no real member is picked: fictional, with a dummy
 * QR link, so the preview never carries a real person's token. Pure and client-safe. Draw it with
 * `withCertificateText(side, values)` and the card canvas (components/cards/CardCanvas.tsx) at the page's size.
 */

export const SAMPLE_VERIFY_URL = "https://example.invalid/verify/certificate/preview";

export function sampleUnits(levelNames: readonly string[]): CardUnit[] {
  const names = [["North", "N"], ["North 1", "N1"]] as const;
  return names.slice(0, Math.max(1, Math.min(2, levelNames.length))).map(([name, code], level) => ({ level, levelName: levelNames[level]?.trim() || "Unit", name, code }));
}

export function sampleCertificate(options: { organisationName: string; unitLevels: readonly string[]; title: string; today?: Date }): { holder: CardHolder; values: CertificateTextValues } {
  const today = options.today ?? new Date();
  const values: CertificateTextValues = {
    memberName: "Asha Menon",
    memberNumber: "M-0042",
    certificateNumber: "CERT-0007",
    title: options.title,
    reason: "In recognition of outstanding service and dedication to the organisation over the past year.",
    date: formatCalendarDate({ year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }),
  };
  const holder: CardHolder = {
    memberId: "preview",
    verifyToken: "preview",
    verifyUrl: SAMPLE_VERIFY_URL,
    displayName: values.memberName,
    role: null,
    planName: "Annual membership",
    details: [],
    photoUrl: null,
    idNumber: values.certificateNumber,
    validUntil: null,
    units: sampleUnits(options.unitLevels),
    contact: { website: null, email: null, phone: null },
    organisationName: options.organisationName,
  };
  return { holder, values };
}
