/**
 * What a public page may point at: links that open on the web or in a mail or phone app, and images that are the
 * organisation's own page uploads. Pure and client-safe.
 */

/** Upload keys the page may reference: the organisation's own page images only. */
export const PAGE_IMAGE_KEY = /^organisations\/[A-Za-z0-9_-]{1,128}\/page-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export function isPageImageKeyFor(key: string, organisationId: string) {
  return PAGE_IMAGE_KEY.test(key) && key.startsWith(`organisations/${organisationId}/page-images/`);
}

/** A PDF the organisation uploaded for the downloads section (lib/storage/pageFiles.ts). */
export const PAGE_FILE_KEY = /^organisations\/[A-Za-z0-9_-]{1,128}\/page-files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

export function isPageFileKey(key: string) {
  return PAGE_FILE_KEY.test(key);
}

/** An upload key a page may hold in a downloads section, and that belongs to this organisation: its page image or page file. */
export function isPageUploadKeyFor(key: string, organisationId: string) {
  return isPageImageKeyFor(key, organisationId) || (PAGE_FILE_KEY.test(key) && key.startsWith(`organisations/${organisationId}/page-files/`));
}

/** Where a visitor downloads an uploaded PDF; `name` becomes the saved file's name. */
export function pageFileUrl(key: string, label: string) {
  return `/api/uploads/${key}?name=${encodeURIComponent(label)}`;
}

/** Where the browser loads an uploaded page image from. */
export function pageImageUrl(key: string) {
  return `/api/uploads/${key}`;
}

/** Links open only on the web or in a mail or phone app; nothing that runs script. */
export function isSafeLink(value: string) {
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  if (/^tel:\+?[0-9 ()-]{3,32}$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Whether a safe link leaves the site (opened in a new tab with noopener). */
export const isExternalLink = (value: string) => /^https?:/i.test(value);
