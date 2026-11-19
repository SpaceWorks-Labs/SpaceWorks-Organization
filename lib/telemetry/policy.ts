import { analyticsTemplate, isBearerUrl } from "./routes";

export type Purpose = "analytics" | "replay" | "diagnostics";
export type Consent = Record<Purpose, boolean>;
export const deniedConsent = (): Consent => ({ analytics: false, replay: false, diagnostics: false });

/** The approved template for a same-origin page, or null. A query or fragment is never sent or used to admit a provider. */
export function safePage(url: URL): string | null {
  if (url.username || url.password || url.origin !== window.location.origin || isBearerUrl(url)) return null;
  return analyticsTemplate(url);
}

/** The consent record is the only storage key written, and only once the visitor has chosen. */
export const consentStorageKey = (scope: string) => `spaceworks.telemetry.consent.v1:${scope}`;
const storageProbeKey = "spaceworks.telemetry.storage-probe.v1";

/** Has this visitor recorded a choice for this scope? Reading writes nothing. */
export function hasDecision(scope: string): boolean {
  try { return localStorage.getItem(consentStorageKey(scope)) !== null; } catch { return false; }
}

/** Persistence failure fails closed: a grant is unsafe if a later withdrawal could not be saved. */
export function readConsent(scope: string): Consent {
  try {
    const raw = localStorage.getItem(consentStorageKey(scope));
    if (raw === null) return deniedConsent();
    // Only a visitor who has already chosen gets a write probe, so a first visit writes nothing at all.
    localStorage.setItem(storageProbeKey, "1");
    localStorage.removeItem(storageProbeKey);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return deniedConsent();
    const row = value as Partial<Consent>;
    return { analytics: row.analytics === true, replay: row.replay === true, diagnostics: row.diagnostics === true };
  } catch { return deniedConsent(); }
}

export function saveConsent(scope: string, value: Consent): boolean {
  try { localStorage.setItem(consentStorageKey(scope), JSON.stringify(value)); return true; }
  catch { try { localStorage.removeItem(consentStorageKey(scope)); } catch { /* readConsent also denies grants while storage is not writable. */ } return false; }
}
