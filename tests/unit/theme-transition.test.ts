import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColorMode } from "@/lib/colorMode";

/**
 * The theme reveal (lib/themeTransition.ts, ported from the kit's motion/theme-reveal) against a minimal fake
 * document. This checks the order of calls; it is not a substitute for watching the reveal in a browser.
 */
type Log = string[];

function fakePage({ viewTransitions = true, reduced = false } = {}) {
  const log: Log = [];
  const classes = new Set<string>();
  const animation = { updatePlaybackRate: vi.fn((rate: number) => log.push(`rate ${rate}`)), play: vi.fn(() => log.push("play")) };
  let finish!: () => void;
  let update: (() => void) | undefined;
  const root = {
    classList: {
      add: (name: string) => { classes.add(name); log.push(`add ${name}`); },
      remove: (...names: string[]) => names.forEach((name) => { if (classes.delete(name)) log.push(`remove ${name}`); }),
      contains: (name: string) => classes.has(name),
    },
    appendChild: () => undefined,
    animate: vi.fn((keyframes: unknown, options: unknown) => { log.push("animate"); return Object.assign(animation, { keyframes, options }); }),
  };
  const document = {
    documentElement: root,
    createElement: () => ({ style: {} as Record<string, string>, remove: () => undefined }),
    startViewTransition: viewTransitions
      ? vi.fn(function (this: unknown, callback: () => void) {
        if (this !== document) throw new TypeError("Illegal invocation");
        log.push(`start (dark=${classes.has("dark")})`);
        update = callback;
        const ready = Promise.resolve().then(() => update?.());
        return { ready, finished: new Promise<void>((resolve) => { finish = resolve; }), skipTransition: () => log.push("skip") };
      })
      : undefined,
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: reduced, addEventListener: () => undefined }) });
  vi.stubGlobal("getComputedStyle", (element: unknown) => (element === root
    ? { getPropertyValue: () => " cubic-bezier(0.2, 0, 0, 1)" }
    : { transitionDuration: "720ms" }));
  const paint = vi.fn((next: ColorMode) => { log.push(`paint ${next}`); if (next === "dark") classes.add("dark"); else classes.delete("dark"); });
  const origin = { getBoundingClientRect: () => ({ left: 900, top: 10, width: 44, height: 44 }) } as unknown as Element;
  return { log, root, document, paint, origin, animation, finish: () => finish(), isDark: () => classes.has("dark") };
}

async function load() {
  vi.resetModules();
  return import("@/lib/themeTransition");
}

/** Let the transition's promises settle (a real timer, not a fake one). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("theme reveal", () => {
  it("flips light to dark and back immediately without View Transitions", async () => {
    const { switchColorMode } = await load();
    const page = fakePage({ viewTransitions: false });
    await switchColorMode("dark", page.origin, page.paint);
    expect(page.isDark()).toBe(true);
    await switchColorMode("light", page.origin, page.paint);
    expect(page.isDark()).toBe(false);
    expect(page.log).toEqual(["paint dark", "paint light"]);
  });

  it("changes immediately under reduced motion", async () => {
    const { switchColorMode } = await load();
    const page = fakePage({ reduced: true });
    await switchColorMode("dark", page.origin, page.paint);
    expect(page.document.startViewTransition).not.toHaveBeenCalled();
    expect(page.log).toEqual(["paint dark"]);
  });

  it("snapshots first, paints inside the transition, then grows a 720ms clip-path circle from the toggle", async () => {
    const { switchColorMode } = await load();
    const page = fakePage();
    const done = switchColorMode("dark", page.origin, page.paint);
    await flush();
    expect(page.log.slice(0, 4)).toEqual(["add sw-theme-reveal", "start (dark=false)", "paint dark", "animate"]);
    const [keyframes, options] = page.root.animate.mock.calls[0]!;
    const radius = Math.hypot(922, 800 - 32);
    expect(keyframes).toEqual({ clipPath: ["circle(0px at 922px 32px)", `circle(${radius}px at 922px 32px)`] });
    expect(options).toEqual({ duration: 720, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both", pseudoElement: "::view-transition-new(root)" });
    page.finish();
    await done;
    expect(page.log.at(-1)).toBe("remove sw-theme-reveal");
  });

  it("reverses the same mask when asked again mid-reveal", async () => {
    const { switchColorMode } = await load();
    const page = fakePage();
    const first = switchColorMode("dark", page.origin, page.paint);
    await flush();
    const second = switchColorMode("light", page.origin, page.paint);
    expect(second).toBe(first);
    expect(page.document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(page.log.slice(-3)).toEqual(["paint light", "rate -1", "play"]);
    switchColorMode("dark", page.origin, page.paint);
    expect(page.log.slice(-3)).toEqual(["paint dark", "rate 1", "play"]);
  });

  it("does nothing animated when the mode is already painted", async () => {
    const { switchColorMode } = await load();
    const page = fakePage();
    await switchColorMode("light", page.origin, page.paint);
    expect(page.document.startViewTransition).not.toHaveBeenCalled();
  });
});

describe("colour-mode toggle", () => {
  it("is one icon button named Dark theme, pressed while dark", async () => {
    const { Providers } = await import("@/components/providers");
    const { ColorModeToggle } = await import("@/components/chrome/ColorModeToggle");
    const html = (mode: ColorMode) => renderToStaticMarkup(createElement(Providers, { initialColorMode: mode } as Parameters<typeof Providers>[0], createElement(ColorModeToggle)));
    expect(html("light")).toMatch(/<button[^>]*aria-label="Dark theme"[^>]*aria-pressed="false"/);
    expect(html("dark")).toMatch(/aria-pressed="true"/);
    expect(html("light")).toContain("lucide-sun");
    expect(html("dark")).toContain("lucide-moon");
    expect(html("light")).not.toMatch(/System|aria-haspopup/);
  });
});
