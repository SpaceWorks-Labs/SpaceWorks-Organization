/**
 * Quiet hours: a window of the day, in the organisation's timezone, when texts and chat messages wait. The window
 * is minutes after midnight and may cross midnight (22:00 to 08:00). Email is never held back.
 */
export function localMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export function inQuietHours(at: Date, timeZone: string, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  const now = localMinutes(at, timeZone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** When the current quiet window ends, or null when it is not quiet now. */
export function quietEnd(at: Date, timeZone: string, start: number | null, end: number | null): Date | null {
  if (start === null || end === null || !inQuietHours(at, timeZone, start, end)) return null;
  const wait = (end - localMinutes(at, timeZone) + 1440) % 1440 || 1440;
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000 + wait * 60_000);
}

/** "22:00" to minutes after midnight, or null when it is not a time. */
export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export const formatClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
