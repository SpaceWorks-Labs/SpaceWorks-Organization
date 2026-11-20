/**
 * PDFs an organisation offers for download from its public page (the downloads section). The file is checked by its
 * first bytes, never by the type the browser claims, and is only ever served as an attachment (app/api/uploads).
 * Pure: no storage or request access.
 */

/** Kept under the server actions body limit (next.config.ts), like page images. */
export const MAX_PAGE_FILE_BYTES = 5 * 1024 * 1024;
export const PAGE_FILE_TYPE = "application/pdf";

/** A real PDF starts with "%PDF-". */
export function looksLikePdf(body: Uint8Array): boolean {
  return body.length > 8 && body[0] === 0x25 && body[1] === 0x50 && body[2] === 0x44 && body[3] === 0x46 && body[4] === 0x2d;
}

/** A download name that is safe in a Content-Disposition header: plain ASCII, no path or quote characters, ending in .pdf. */
export function safeDownloadName(label: string | null | undefined): string {
  const stem = (label ?? "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, "_")
    .replace(/^[ ._-]+|[ ._-]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return `${stem || "download"}.pdf`;
}
