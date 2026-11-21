/**
 * Plain formatting for the platform analytics pages: counts, ratios, ages, bytes, relative times and the
 * codes the data layer returns (channels, methods, purposes). Pure and server-safe.
 */

export const count = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("en-IN"));

/** A ratio (0.1) as "10%". */
export const percent = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : `${Math.round(value * 100)}%`);

/** A signed ratio as "+12%", "−3%" or "0%", with a true minus sign. */
export function signedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100);
  return rounded === 0 ? "0%" : `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

/** Seconds as "under a minute", "12 min", "3 h 5 min" or "4 days". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return "under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

/** Bytes as "512 B", "3.4 MB", "1.2 GB" (1024 steps). */
export function bytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(size) : size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

/** "12 Mar 2026". */
export const shortDate = (value: Date | string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(asDate(value));

/** "3 days ago", "yesterday", "2 hours ago", against the view's own clock so the server and the page agree. */
export function relativeTime(value: Date | string | null, now: Date | string): string {
  if (!value) return "Never";
  const seconds = (asDate(value).getTime() - asDate(now).getTime()) / 1000;
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
  const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return "just now";
}

const NAMES: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  SLACK: "Slack",
  DISCORD: "Discord",
  MATTERMOST: "Mattermost",
  WEBHOOK: "Signed webhook",
  NONE: "Not sent yet",
  S3: "S3",
  R2: "Cloudflare R2",
  oidc: "OpenID Connect",
  saml: "SAML",
  otp: "One-time code",
  totp: "Authenticator",
  "sms-code": "SMS code",
  "chat-notice": "Team chat alert",
  "member-message": "Member message",
};

/** A code from the data layer as a sentence-case label: "bad_password" → "Bad password". */
export function humanise(code: string | null | undefined): string {
  if (!code) return "Unknown";
  if (NAMES[code]) return NAMES[code];
  const words = code.replace(/[-_:.]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown";
}

/** "Indian rupee (INR)", or the code alone when the runtime has no name for it. */
export function currencyName(code: string): string {
  try {
    const name = new Intl.DisplayNames("en-GB", { type: "currency" }).of(code);
    if (!name || name === code) return code;
    // Sentence case without breaking initialisms: "US Dollar" → "US dollar", "Indian Rupee" → "Indian rupee".
    const words = name.split(" ").map((word, index) => (index === 0 || word === word.toUpperCase() ? word : word.toLowerCase()));
    return `${words.join(" ")} (${code})`;
  } catch {
    return code;
  }
}

/** A path with only the query values that are set. */
export function withQuery(path: string, query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

/** Sum consecutive day buckets into weeks (for grouped columns, which cannot fit 30 or 90 slots of four bars). */
export function byWeek<T extends { key: string; label: string }>(points: T[], fields: ReadonlyArray<keyof T>): Array<{ key: string; label: string } & Record<string, number>> {
  const weeks: Array<{ key: string; label: string } & Record<string, number>> = [];
  for (let start = 0; start < points.length; start += 7) {
    const slice = points.slice(start, start + 7);
    const week = { key: slice[0].key, label: slice[0].label } as { key: string; label: string } & Record<string, number>;
    for (const field of fields) (week as Record<string, unknown>)[field as string] = slice.reduce((sum, point) => sum + (Number(point[field]) || 0), 0);
    weeks.push(week);
  }
  return weeks;
}
