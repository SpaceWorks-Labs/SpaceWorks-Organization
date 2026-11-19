import { COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, THEME_COLOR, isColorMode, paintedColorMode, type ColorMode, type PaintedColorMode } from "@/lib/colorMode";

/**
 * Browser side of the colour mode (CR-THEME-01). The cookie is the record (the server renders a fixed choice
 * from it), localStorage mirrors it for cross-tab updates, and a session value keeps the choice working for
 * this page when both are blocked.
 */
const DARK_QUERY = "(prefers-color-scheme: dark)";
let sessionChoice: ColorMode | undefined;

function readCookie(): string | null {
  try {
    return new RegExp(`(?:^|;\\s*)${COLOR_MODE_COOKIE.replace(".", "\\.")}=([^;]*)`).exec(document.cookie)?.[1] ?? null;
  } catch {
    return null;
  }
}

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The person's choice: this page's session choice, then the cookie, then localStorage, then light. */
export function readColorMode(): ColorMode {
  if (sessionChoice) return sessionChoice;
  const cookie = readCookie();
  if (isColorMode(cookie)) return cookie;
  const stored = readStorage();
  return isColorMode(stored) ? stored : "light";
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** The mode painted right now, read from the class on <html>. */
export function readPaintedColorMode(): PaintedColorMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function resolvePaintedColorMode(mode: ColorMode = readColorMode()): PaintedColorMode {
  return paintedColorMode(mode, systemPrefersDark());
}

/** Paint a mode: the class, native control colours and the browser chrome colour. */
export function paintColorMode(painted: PaintedColorMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", painted === "dark");
  root.style.colorScheme = painted;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[painted]);
}

/** Save a choice in the cookie and localStorage (each may fail on its own) and for this page's session. */
export function saveColorMode(mode: ColorMode) {
  sessionChoice = mode;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COLOR_MODE_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked: the session choice still applies */
  }
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    /* storage blocked: the session choice still applies */
  }
}

/**
 * Keep this tab in step: another tab's choice arrives through the `storage` event, and the device's light/dark
 * setting is followed only while System is chosen. `onChange` runs after each repaint. Returns a cleanup.
 */
export function watchColorMode(onChange: () => void): () => void {
  const repaint = () => {
    paintColorMode(resolvePaintedColorMode());
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_MODE_STORAGE_KEY && event.key !== null) return;
    sessionChoice = undefined;
    repaint();
  };
  const onSystem = () => {
    if (readColorMode() === "system") repaint();
  };
  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia(DARK_QUERY);
  } catch {
    media = undefined;
  }
  // The root layout renders the class from the cookie, so a server re-render (refresh, revalidation) can rewrite it
  // after a change to System; put the chosen paint back whenever <html> drifts from it.
  const root = document.documentElement;
  const observer = new MutationObserver(() => {
    const want = resolvePaintedColorMode();
    if (readPaintedColorMode() !== want || root.style.colorScheme !== want) repaint();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", onSystem);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onSystem);
  };
}
