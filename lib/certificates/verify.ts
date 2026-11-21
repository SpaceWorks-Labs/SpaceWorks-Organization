import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { certificateState } from "./core";

/*
 * What the public certificate check page may show: the title, the organisation, the certificate number, the date
 * it was issued and whether it is still valid; the member's name only while it is. Never contact details, the
 * citation or the reason it was revoked. Unknown tokens, erased members and organisations that are not running
 * are all the same "not found", so the page never confirms that a token or a person exists.
 */

export type CertificateVerifyView =
  | { state: "not-found" }
  | { state: "suspended"; organisationName: string }
  | {
      state: "certificate";
      verdict: "valid" | "revoked";
      title: string;
      /** Null once revoked: a revoked certificate no longer names its holder. */
      memberName: string | null;
      organisationName: string;
      organisationSlug: string;
      organisationLogoUrl: string | null;
      certificateNumber: string;
      /** The issue date as printed ("21 Nov 2026"), in the organisation's timezone. */
      issuedOn: string;
      timeZone: string;
    };

export type CertificateVerifyRecord = {
  certificate: { title: string; certificateNumber: string; issuedAt: Date; revokedAt: Date | null };
  member: { name: string; anonymisedAt: Date | null };
  organisation: { name: string; slug: string; status: string; timezone: string; logoUrl: string | null };
};

export function certificateVerificationView(record: CertificateVerifyRecord | null): CertificateVerifyView {
  if (!record || record.member.anonymisedAt) return { state: "not-found" };
  const { organisation, certificate } = record;
  if (organisation.status === "SUSPENDED" || organisation.status === "ARCHIVED") return { state: "suspended", organisationName: organisation.name };
  if (organisation.status !== "ACTIVE") return { state: "not-found" };
  const verdict = certificateState(certificate);
  return {
    state: "certificate",
    verdict,
    title: certificate.title,
    memberName: verdict === "valid" ? record.member.name : null,
    organisationName: organisation.name,
    organisationSlug: organisation.slug,
    organisationLogoUrl: organisation.logoUrl,
    certificateNumber: certificate.certificateNumber,
    issuedOn: formatCalendarDate(localDate(certificate.issuedAt, organisation.timezone)),
    timeZone: organisation.timezone,
  };
}
