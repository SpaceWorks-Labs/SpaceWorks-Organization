/**
 * Colour mode: Light (the default) or Dark, nothing else. Owner decision 2026-11-19 overrides CR-THEME-01's System
 * option (SpaceWorks-Design docs/theming.md): the device's `prefers-color-scheme` is never consulted. A value saved
 * by an earlier build ("system") or anything unknown reads as light. Shared by the server (root layout) and the browser.
 */
export type ColorMode = "light" | "dark";

/** The choice lives in this cookie (so the server paints it without a flash) and is mirrored to localStorage under
 * the same key (so other tabs follow through the `storage` event). */
export const COLOR_MODE_COOKIE = "swo.theme";
export const COLOR_MODE_STORAGE_KEY = COLOR_MODE_COOKIE;
export const COLOR_MODES: readonly ColorMode[] = ["light", "dark"];

/** Browser chrome (`meta[name=theme-color]`) for each mode: Warm Cream and black. */
export const THEME_COLOR: Record<ColorMode, string> = { light: "#FFF4E8", dark: "#000000" };

export function isColorMode(value: string | null | undefined): value is ColorMode {
  return value === "light" || value === "dark";
}

/** The saved choice, or light (also for an old "system" and anything unknown). */
export function resolveColorMode(saved: string | null | undefined): ColorMode {
  return saved === "dark" ? "dark" : "light";
}

/** What the toggle switches to. */
export function oppositeColorMode(mode: ColorMode): ColorMode {
  return mode === "dark" ? "light" : "dark";
}

/**
 * The pre-paint boot script, inlined in <head> with the request's CSP nonce (app/layout.tsx). It only re-applies the
 * saved choice (cookie first, then the localStorage mirror; anything else is light), sets html.dark and
 * color-scheme, and updates meta[name=theme-color]. Storage failures fall back to the cookie or light.
 */
export const COLOR_MODE_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(COLOR_MODE_COOKIE)},d=document.documentElement,p=null;` +
  `var c=document.cookie.match(/(?:^|;\\s*)swo\\.theme=(light|dark)(?:;|$)/);if(c)p=c[1];` +
  `if(!p){try{p=localStorage.getItem(k)}catch(e){}}var dark=p==="dark";` +
  `d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";` +
  `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",dark?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});` +
  `}catch(e){}})();`;
