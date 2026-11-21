import { CERTIFICATE_PREFIX_PATTERN, certificateNumberFormatError, DEFAULT_CERTIFICATE_NUMBER_FORMAT, normalizeCertificateNumberFormat, normalizeCertificateSide, type CertificateSide } from "./design";
import { readPage, TYPE_LABEL_MAX, type CertificatePage } from "./pages";

/*
 * A certificate design's pending changes. Staff with `certificates.design` save drafts; issued certificates keep
 * the approved (live) design, page and numbering until the organisation's owner approves the draft
 * (lib/certificates/approval.ts).
 */

export type CertificateDraft = CertificatePage & { design: CertificateSide; numberPrefix: string; numberFormat: string; typeLabel: string };

export type CertificateRow = {
  design: unknown; draft: unknown; pageSize: string; orientation: string; numberPrefix: string; numberFormat: string; typeLabel: string;
};

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** What the designer edits: the draft when there is one, else the live design. Every value is checked again. */
export function readCertificateDraft(row: CertificateRow, context: { organisationName: string }): CertificateDraft {
  const draft = record(row.draft);
  const page = readPage({ pageSize: draft?.pageSize ?? row.pageSize, orientation: draft?.orientation ?? row.orientation });
  const prefix = typeof draft?.numberPrefix === "string" && CERTIFICATE_PREFIX_PATTERN.test(draft.numberPrefix) ? draft.numberPrefix : row.numberPrefix;
  const format = typeof draft?.numberFormat === "string" && !certificateNumberFormatError(draft.numberFormat) ? normalizeCertificateNumberFormat(draft.numberFormat) : row.numberFormat || DEFAULT_CERTIFICATE_NUMBER_FORMAT;
  const label = typeof draft?.typeLabel === "string" && draft.typeLabel.trim() ? draft.typeLabel.trim().slice(0, TYPE_LABEL_MAX) : row.typeLabel;
  return { ...page, design: normalizeCertificateSide(draft ? draft.design : row.design, context, page), numberPrefix: prefix, numberFormat: format, typeLabel: label };
}

/** The live design as issued certificates draw it: the saved live columns only, never the draft. */
export function readLiveCertificate(row: CertificateRow, context: { organisationName: string }) {
  return readCertificateDraft({ ...row, draft: null }, context);
}

/** Whether a draft would change anything on issued certificates. */
export function certificateDraftDiffers(row: CertificateRow, context: { organisationName: string }) {
  if (!row.draft) return false;
  if (row.design === null) return true;
  return JSON.stringify(readCertificateDraft(row, context)) !== JSON.stringify(readLiveCertificate(row, context));
}
