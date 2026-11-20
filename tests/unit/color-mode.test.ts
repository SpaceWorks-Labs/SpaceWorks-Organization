import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { COLOR_MODES, COLOR_MODE_BOOT_SCRIPT, COLOR_MODE_COOKIE, COLOR_MODE_STORAGE_KEY, THEME_COLOR, isColorMode, oppositeColorMode, resolveColorMode } from "@/lib/colorMode";
import { installAriaDisabledGuard, isInsideAriaDisabled } from "@/lib/ariaDisabled";

describe("colour mode (Light and Dark only, owner decision 2026-11-19)", () => {
  it("defaults to light when nothing is saved or the value is unknown", () => {
    expect(resolveColorMode(undefined)).toBe("light");
    expect(resolveColorMode(null)).toBe("light");
    expect(resolveColorMode("")).toBe("light");
    expect(resolveColorMode("sepia")).toBe("light");
  });

  it("reads a System choice saved by an earlier build as light", () => {
    expect(resolveColorMode("system")).toBe("light");
    expect(isColorMode("system")).toBe(false);
    expect(COLOR_MODES).toEqual(["light", "dark"]);
  });

  it("honours light and dark, and the toggle flips between them", () => {
    expect(resolveColorMode("dark")).toBe("dark");
    expect(resolveColorMode("light")).toBe("light");
    expect(oppositeColorMode("light")).toBe("dark");
    expect(oppositeColorMode("dark")).toBe("light");
  });

  it("uses the organisation product cookie name, mirrored to storage, and the kit's chrome colours", () => {
    expect(COLOR_MODE_COOKIE).toBe("swo.theme");
    expect(COLOR_MODE_STORAGE_KEY).toBe("swo.theme");
    expect(THEME_COLOR).toEqual({ light: "#FFF4E8", dark: "#000000" });
  });
});

/** Runs the boot script against a minimal document and returns what it painted. */
function boot({ cookie = "", stored = null as string | null, storageThrows = false } = {}) {
  const classes = new Set<string>();
  const meta = { content: THEME_COLOR.light, setAttribute(_: string, value: string) { this.content = value; } };
  const root = { style: { colorScheme: "" }, classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) } };
  let mediaQueries = 0;
  const matchMedia = () => { mediaQueries += 1; return { matches: true }; };
  runInNewContext(COLOR_MODE_BOOT_SCRIPT, {
    document: { cookie, documentElement: root, querySelector: () => meta },
    localStorage: { getItem: () => { if (storageThrows) throw new Error("blocked"); return stored; } },
    window: { matchMedia },
    matchMedia,
  });
  return { dark: classes.has("dark"), scheme: root.style.colorScheme, meta: meta.content, mediaQueries };
}

describe("colour mode boot script", () => {
  it("never asks the device", () => {
    expect(COLOR_MODE_BOOT_SCRIPT).not.toContain("prefers-color-scheme");
    expect(COLOR_MODE_BOOT_SCRIPT).not.toContain("matchMedia");
    expect(COLOR_MODE_BOOT_SCRIPT).not.toContain("system");
  });

  it("paints light by default, even on a dark device", () => {
    expect(boot()).toEqual({ dark: false, scheme: "light", meta: "#FFF4E8", mediaQueries: 0 });
  });

  it("paints a saved dark choice from the cookie and sets the black chrome colour", () => {
    expect(boot({ cookie: "a=1; swo.theme=dark" })).toEqual({ dark: true, scheme: "dark", meta: "#000000", mediaQueries: 0 });
    expect(boot({ cookie: "swo.theme=light", stored: "dark" })).toMatchObject({ dark: false });
  });

  it("paints an old System choice as light", () => {
    expect(boot({ cookie: "swo.theme=system" })).toMatchObject({ dark: false, meta: "#FFF4E8", mediaQueries: 0 });
    expect(boot({ stored: "system" })).toMatchObject({ dark: false, mediaQueries: 0 });
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
