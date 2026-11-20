import { COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, THEME_COLOR, isColorMode, type ColorMode } from "@/lib/colorMode";

/**
 * Browser side of the colour mode (Light or Dark; owner decision 2026-11-19). The cookie is the record (the server
 * paints from it), localStorage mirrors it for cross-tab updates, and a session value keeps the choice working for
 * this page when both are blocked. The device's light/dark setting is never read.
 */
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
  return readStorage() === "dark" ? "dark" : "light";
}

/** The mode painted right now, read from the class on <html>. */
export function readPaintedColorMode(): ColorMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Paint a mode: the class, native control colours and the browser chrome colour. */
export function paintColorMode(mode: ColorMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[mode]);
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
 * Keep this tab in step: another tab's choice arrives through the `storage` event. `onChange` runs after each
 * repaint. Returns a cleanup.
 */
export function watchColorMode(onChange: () => void): () => void {
  const repaint = () => {
    paintColorMode(readColorMode());
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_MODE_STORAGE_KEY && event.key !== null) return;
    sessionChoice = undefined;
    repaint();
  };
  // The root layout renders the class from the cookie, so a server re-render (refresh, revalidation) can rewrite it
  // when the cookie is blocked and only the session choice holds; put the chosen paint back whenever <html> drifts.
  // A theme reveal in progress is left alone (it paints inside its own view transition).
  const root = document.documentElement;
  const observer = new MutationObserver(() => {
    if (root.classList.contains("sw-theme-reveal")) return;
    const want = readColorMode();
    if (readPaintedColorMode() !== want || root.style.colorScheme !== want) repaint();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}
