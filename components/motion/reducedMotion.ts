import { useSyncExternalStore } from "react";

/**
 * Motion timing in JS (CR-MOTION-01). The CSS twins are the --sw-dur-* tokens in app/styles/tokens.css; keep the
 * two in step, because a JS exit timer shorter than its CSS exit animation would cut it off.
 * - Overlays enter over slow (240) and leave over two-thirds of it (160).
 * - Toasts enter over base (180) and leave over fast (120).
 */
export const MOTION_MS = { fast: 120, base: 180, slow: 240, overlayOut: 160, toastIn: 180, toastOut: 120 } as const;

const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(QUERY);
}

export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

/** Touch-only devices: hover effects and the logo cycle never start there. */
export function canHover(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover)").matches;
}

/**
 * True only where animations really run: a browser with the Web Animations API and no reduced-motion preference.
 * Elsewhere (server, tests, reduced motion) exits finish at once and nothing waits for an animation.
 */
export function canAnimate(): boolean {
  return typeof document !== "undefined" && typeof document.getAnimations === "function" && !prefersReducedMotion();
}

function subscribe(onChange: () => void) {
  const list = media();
  if (!list) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** The reduced-motion preference, live; false on the server so markup never depends on it. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** The exit wait for a layer: none when nothing animates, otherwise the exit plus a frame or two of slack. */
export function exitWait(exitMs: number, animated: boolean): number {
  return animated ? exitMs + 80 : 0;
}
