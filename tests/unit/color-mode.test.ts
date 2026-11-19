import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { COLOR_MODE_BOOT_SCRIPT, COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, THEME_COLOR, isColorMode, paintedColorMode, resolveColorMode, serverPaintedColorMode } from "@/lib/colorMode";
import { installAriaDisabledGuard, isInsideAriaDisabled } from "@/lib/ariaDisabled";

describe("colour mode", () => {
  it("defaults to light when nothing is saved or the value is unknown", () => {
    expect(resolveColorMode(undefined)).toBe("light");
    expect(resolveColorMode(null)).toBe("light");
    expect(resolveColorMode("")).toBe("light");
    expect(resolveColorMode("sepia")).toBe("light");
  });

  it("honours light, dark and system", () => {
    expect(resolveColorMode("dark")).toBe("dark");
    expect(resolveColorMode("light")).toBe("light");
    expect(resolveColorMode("system")).toBe("system");
    expect(isColorMode("system")).toBe(true);
    expect(isColorMode("auto")).toBe(false);
  });

  it("follows the device only for system", () => {
    expect(paintedColorMode("system", true)).toBe("dark");
    expect(paintedColorMode("system", false)).toBe("light");
    expect(paintedColorMode("light", true)).toBe("light");
    expect(paintedColorMode("dark", false)).toBe("dark");
  });

  it("lets the server paint only a fixed choice", () => {
    expect(serverPaintedColorMode("dark")).toBe("dark");
    expect(serverPaintedColorMode("light")).toBe("light");
    expect(serverPaintedColorMode("system")).toBeNull();
  });

  it("uses the organisation product cookie name, mirrored to storage, and the kit's chrome colours", () => {
    expect(COLOR_MODE_COOKIE).toBe("swo.theme");
    expect(COLOR_MODE_STORAGE_KEY).toBe("swo.theme");
    expect(THEME_COLOR).toEqual({ light: "#FFF4E8", dark: "#000000" });
  });
});

/** Runs the boot script against a minimal document and returns what it painted. */
function boot({ cookie = "", stored = null as string | null, systemDark = false, storageThrows = false } = {}) {
  const classes = new Set<string>();
  const meta = { content: THEME_COLOR.light, setAttribute(_: string, value: string) { this.content = value; } };
  const root = { style: { colorScheme: "" }, classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) } };
  let mediaQueries = 0;
  runInNewContext(COLOR_MODE_BOOT_SCRIPT, {
    document: { cookie, documentElement: root, querySelector: () => meta },
    localStorage: { getItem: () => { if (storageThrows) throw new Error("blocked"); return stored; } },
    window: { matchMedia: true },
    matchMedia: () => { mediaQueries += 1; return { matches: systemDark }; },
  });
  return { dark: classes.has("dark"), scheme: root.style.colorScheme, meta: meta.content, mediaQueries };
}

describe("colour mode boot script", () => {
  it("paints light by default without asking the device", () => {
    expect(boot({ systemDark: true })).toEqual({ dark: false, scheme: "light", meta: "#FFF4E8", mediaQueries: 0 });
  });

  it("paints a saved dark choice from the cookie and sets the black chrome colour", () => {
    expect(boot({ cookie: "a=1; swo.theme=dark" })).toMatchObject({ dark: true, scheme: "dark", meta: "#000000", mediaQueries: 0 });
  });

  it("checks the device only for system", () => {
    expect(boot({ cookie: "swo.theme=system", systemDark: true })).toMatchObject({ dark: true, mediaQueries: 1 });
    expect(boot({ cookie: "swo.theme=system", systemDark: false })).toMatchObject({ dark: false, mediaQueries: 1 });
  });

  it("falls back to localStorage, and to light when storage throws", () => {
    expect(boot({ stored: "dark" })).toMatchObject({ dark: true });
    expect(boot({ storageThrows: true })).toMatchObject({ dark: false, meta: "#FFF4E8" });
  });
});

describe("aria-disabled guard", () => {
  it("cancels clicks (including keyboard activation) inside an aria-disabled control and nothing else", () => {
    type Listener = (event: Event) => void;
    const listeners: Array<[string, Listener, boolean]> = [];
    const doc = {
      addEventListener: (type: string, listener: Listener, capture: boolean) => listeners.push([type, listener, capture]),
      removeEventListener: (type: string, listener: Listener) => listeners.splice(listeners.findIndex((entry) => entry[0] === type && entry[1] === listener), 1),
    } as unknown as Document;
    const stop = installAriaDisabledGuard(doc);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]![0]).toBe("click");
    expect(listeners[0]![2]).toBe(true);
    expect(isInsideAriaDisabled(null)).toBe(false);
    stop();
    expect(listeners).toHaveLength(0);
  });
});
