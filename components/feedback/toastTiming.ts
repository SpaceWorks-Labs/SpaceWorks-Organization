/**
 * Toast lifetime (UX-8.9, kit motion/toast; pure, unit-tested). A toast stays 8 seconds of reading time by default;
 * errors stay until dismissed. Hovering or focusing a toast pauses its clock, and leaving resumes it with the time
 * that was left, so nobody loses a message they are reading or about to act on.
 */
export type ToastSeverity = "success" | "error" | "info" | "warning";

export const TOAST_DEFAULT_MS = 8000;
/** At most this many toasts show at once; the oldest makes room for a new one. */
export const TOAST_LIMIT = 3;

/** How long a toast lives, in ms, or null when it waits to be dismissed. */
export function toastLifetime(severity: ToastSeverity, requestedMs?: number): number | null {
  if (severity === "error") return null;
  if (requestedMs === undefined || !Number.isFinite(requestedMs) || requestedMs <= 0) return TOAST_DEFAULT_MS;
  return requestedMs;
}

/** `remaining` is null for a toast that never expires; `runningSince` is set while the clock runs. */
export type ToastClock = { remaining: number | null; runningSince: number | null };

export function startClock(lifetime: number | null, now: number): ToastClock {
  return { remaining: lifetime, runningSince: lifetime === null ? null : now };
}

export function pauseClock(clock: ToastClock, now: number): ToastClock {
  if (clock.remaining === null || clock.runningSince === null) return clock;
  return { remaining: Math.max(0, clock.remaining - (now - clock.runningSince)), runningSince: null };
}

export function resumeClock(clock: ToastClock, now: number): ToastClock {
  if (clock.remaining === null || clock.runningSince !== null) return clock;
  return { remaining: clock.remaining, runningSince: now };
}

/** Time left at `now`: null for a toast that never expires; while paused it stands still. */
export function timeLeft(clock: ToastClock, now: number): number | null {
  if (clock.remaining === null) return null;
  if (clock.runningSince === null) return clock.remaining;
  return Math.max(0, clock.remaining - (now - clock.runningSince));
}
