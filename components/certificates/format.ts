/** "21 Nov 2026" from an ISO date; with `timeZone`, the day there (else the server's). */
export function formatIssuedDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
}

/** "21 Nov 2026, 14:05" from an ISO date. */
export function formatIssuedDateTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
}
