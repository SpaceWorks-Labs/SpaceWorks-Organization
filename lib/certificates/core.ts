import { VERIFY_TOKEN_PATTERN } from "@/lib/cards/core";

/*
 * Certificate rules shared by the server, the dashboard and tests. Pure functions only.
 */

/** Certificates use the same 32-byte base64url verify tokens as cards: 43 characters, never guessable. */
export const CERTIFICATE_TOKEN_PATTERN = VERIFY_TOKEN_PATTERN;

export function certificateVerifyPath(token: string) {
  return `/verify/certificate/${token}`;
}

/** The OrgCounter row a design's running number lives in: one series per design, restarting each year when the pattern has a year. */
export function certificateCounterName(designId: string, year: number | null) {
  return ["certificate", designId, ...(year ? [String(year)] : [])].join(":");
}

export type CertificateState = "valid" | "revoked";

export function certificateState(certificate: { revokedAt: Date | null }): CertificateState {
  return certificate.revokedAt ? "revoked" : "valid";
}

export const CERTIFICATE_STATE_LABELS: Record<CertificateState, string> = { valid: "Valid", revoked: "Revoked" };

/** At most this many certificates are issued in one request. */
export const ISSUE_LIMIT = 200;
/** One bulk download holds at most this many certificates (a ZIP is slower per file, so it is smaller). */
export const BULK_PDF_LIMIT = 500;
export const BULK_ZIP_LIMIT = 200;

export const CERTIFICATE_TARGET_KINDS = ["members", "plan", "group"] as const;
export type CertificateTargetKind = (typeof CERTIFICATE_TARGET_KINDS)[number];

/** The file name of one certificate download, without the extension. */
export function certificateFileBase(number: string, memberName: string) {
  const words = memberName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "member";
  return `${number.replace(/[^A-Za-z0-9._-]/g, "-")}-${words}`;
}
