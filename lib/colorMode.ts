/**
 * Colour mode (CR-THEME-01, SpaceWorks-Design docs/theming.md): the person chooses Light, Dark or System.
 * Light is the fallback. System follows the device's `prefers-color-scheme`, and only while it is chosen; a
 * fixed choice ignores OS changes. Shared by the server (root layout) and the browser.
 */
export type ColorMode = "light" | "dark" | "system";
/** The theme actually painted: the class "dark" on <html>, or its absence. */
export type PaintedColorMode = "light" | "dark";

/** The choice lives in this cookie (so the server can render a fixed choice without a flash) and is mirrored to
 * localStorage under the same key (so other tabs follow through the `storage` event). */
export const COLOR_MODE_COOKIE = "swo.theme";
export const COLOR_MODE_STORAGE_KEY = COLOR_MODE_COOKIE;
export const COLOR_MODES: readonly ColorMode[] = ["light", "dark", "system"];

/** Browser chrome (`meta[name=theme-color]`) for each painted mode: Warm Cream and black. */
export const THEME_COLOR: Record<PaintedColorMode, string> = { light: "#FFF4E8", dark: "#000000" };

export function isColorMode(value: string | null | undefined): value is ColorMode {
  return value === "light" || value === "dark" || value === "system";
}

/** The saved choice, or light. */
export function resolveColorMode(saved: string | null | undefined): ColorMode {
  return isColorMode(saved) ? saved : "light";
}

/** What to paint for a choice; `systemDark` is the device's preference and only matters for System. */
export function paintedColorMode(mode: ColorMode, systemDark: boolean): PaintedColorMode {
  return mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";
}

/** What the server can paint before any script runs: a fixed choice, or nothing for System (the boot script decides). */
export function serverPaintedColorMode(mode: ColorMode): PaintedColorMode | null {
  return mode === "system" ? null : mode;
}

/**
 * The pre-paint boot script, inlined in <head> with the request's CSP nonce (app/layout.tsx). It reads the
 * choice (cookie first, then localStorage), checks the OS only for System, sets html.dark and color-scheme,
 * and updates meta[name=theme-color]. Storage failures fall back to the cookie or light.
 */
export const COLOR_MODE_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(COLOR_MODE_COOKIE)},d=document.documentElement,p=null;` +
  `var c=document.cookie.match(/(?:^|;\\s*)swo\\.theme=(light|dark|system)(?:;|$)/);if(c)p=c[1];` +
  `if(!p){try{p=localStorage.getItem(k)}catch(e){}}if(p!=="dark"&&p!=="system")p="light";` +
  `var dark=p==="dark"||(p==="system"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);` +
  `d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";` +
  `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",dark?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});` +
  `}catch(e){}})();`;
