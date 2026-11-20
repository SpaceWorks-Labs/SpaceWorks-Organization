import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropExited, mergeExiting, presenceReducer, type PresencePhase } from "@/components/motion/presence";
import { canAnimate, canHover, exitWait, MOTION_MS, prefersReducedMotion } from "@/components/motion/reducedMotion";
import { pageAnnouncement } from "@/components/motion/routeAnnouncement";
import { pauseClock, resumeClock, startClock, timeLeft, toastLifetime, TOAST_DEFAULT_MS, TOAST_LIMIT } from "@/components/feedback/toastTiming";

const styles = (name: string) => readFileSync(path.join(process.cwd(), "app", "styles", name), "utf8");

describe("presence state machine", () => {
  it("keeps a layer mounted while its exit plays, and only then unmounts it", () => {
    let phase: PresencePhase = "open";
    phase = presenceReducer(phase, { type: "hide", animated: true });
    expect(phase).toBe("closing");
    phase = presenceReducer(phase, { type: "hide", animated: true });
    expect(phase).toBe("closing");
    phase = presenceReducer(phase, { type: "exited" });
    expect(phase).toBe("closed");
  });

  it("closes at once when nothing animates (server, tests, reduced motion)", () => {
    expect(presenceReducer("open", { type: "hide", animated: false })).toBe("closed");
    expect(presenceReducer("closed", { type: "hide", animated: true })).toBe("closed");
  });

  it("reopens mid-exit without unmounting, and ignores a stray exit end", () => {
    expect(presenceReducer("closing", { type: "show" })).toBe("open");
    expect(presenceReducer("open", { type: "exited" })).toBe("open");
    expect(presenceReducer("closed", { type: "exited" })).toBe("closed");
  });

  it("keeps vanished rows on screen, flagged leaving, until each exit ends", () => {
    const key = (row: { id: number }) => row.id;
    const before = [{ item: { id: 1 }, leaving: false }, { item: { id: 2 }, leaving: false }];
    const merged = mergeExiting(before, [{ id: 2 }, { id: 3 }], key);
    expect(merged.map((row) => [row.item.id, row.leaving])).toEqual([[1, true], [2, false], [3, false]]);
    expect(dropExited(merged, 1, key).map((row) => row.item.id)).toEqual([2, 3]);
    // A live row with the same key is never dropped by a stale exit timer.
    expect(dropExited(merged, 2, key).map((row) => row.item.id)).toEqual([1, 2, 3]);
  });
});

describe("toast timing", () => {
  it("lives 8 seconds by default, honours an explicit lifetime, and never expires an error", () => {
    expect(TOAST_DEFAULT_MS).toBe(8000);
    expect(toastLifetime("success")).toBe(8000);
    expect(toastLifetime("info", 2500)).toBe(2500);
    expect(toastLifetime("warning", Number.NaN)).toBe(8000);
    expect(toastLifetime("error", 2500)).toBeNull();
    expect(TOAST_LIMIT).toBe(3);
  });

  it("pauses on hover or focus and resumes with the time that was left", () => {
    let clock = startClock(8000, 1_000);
    expect(timeLeft(clock, 4_000)).toBe(5000);
    clock = pauseClock(clock, 4_000);
    expect(timeLeft(clock, 60_000)).toBe(5000);
    clock = pauseClock(clock, 70_000);
    expect(timeLeft(clock, 70_000)).toBe(5000);
    clock = resumeClock(clock, 100_000);
    expect(timeLeft(clock, 102_000)).toBe(3000);
    expect(timeLeft(clock, 200_000)).toBe(0);
  });

  it("keeps an error's clock stopped whatever happens", () => {
    const clock = resumeClock(pauseClock(startClock(null, 0), 10), 20);
    expect(timeLeft(clock, 1_000_000)).toBeNull();
  });
});

describe("reduced-motion helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never animates outside a browser", () => {
    expect(prefersReducedMotion()).toBe(false);
    expect(canAnimate()).toBe(false);
    expect(canHover()).toBe(false);
  });

  it("follows the reduced-motion preference where animations exist", () => {
    const matchMedia = (reduce: boolean) => (query: string) => ({ matches: query.includes("reduce") ? reduce : true, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("document", { getAnimations: () => [] });
    vi.stubGlobal("window", { matchMedia: matchMedia(false) });
    expect(canAnimate()).toBe(true);
    expect(canHover()).toBe(true);
    vi.stubGlobal("window", { matchMedia: matchMedia(true) });
    expect(prefersReducedMotion()).toBe(true);
    expect(canAnimate()).toBe(false);
  });

  it("waits for an exit only when it plays, and keeps the timings on the token scale", () => {
    expect(exitWait(MOTION_MS.overlayOut, false)).toBe(0);
    expect(exitWait(MOTION_MS.overlayOut, true)).toBe(240);
    expect(MOTION_MS).toMatchObject({ fast: 120, base: 180, slow: 240, overlayOut: 160, toastIn: 180, toastOut: 120 });
  });
});

describe("route announcer", () => {
  const page = (pathname: string, title: string, heading = "") => ({ pathname, title, heading });

  it("stays quiet on the first load, for the same path, and when Next.js announces a new title", () => {
    expect(pageAnnouncement(null, page("/dashboard", "Home"))).toBeNull();
    expect(pageAnnouncement({ pathname: "/a", title: "A" }, page("/a", "A", "A"))).toBeNull();
    expect(pageAnnouncement({ pathname: "/a", title: "A" }, page("/b", "B", "B"))).toBeNull();
  });

  it("announces the heading of a page that shares its title", () => {
    expect(pageAnnouncement({ pathname: "/m/1", title: "Member" }, page("/m/1/payments", "Member", "  Payments\n for Asha "))).toBe("Payments for Asha");
    expect(pageAnnouncement({ pathname: "/m/1", title: "Member" }, page("/m/2", "Member"))).toBe("Member");
  });
});

describe("motion CSS (CR-MOTION-01)", () => {
  const files = ["motion.css", "motion-box.css", "motion-overlays.css", "motion-route.css", "motion-search.css", "theme-reveal.css"];

  it("uses the duration and curve tokens, never ad-hoc cubic-beziers", () => {
    for (const name of files.filter((file) => file !== "motion-box.css")) {
      expect(styles(name), name).not.toMatch(/cubic-bezier\(/);
    }
  });

  it("animates transform and opacity only, plus the collapse's grid rows", () => {
    const transitions = files.flatMap((name) => [...styles(name).matchAll(/transition:\s*([^;]+);/g)].map(([, value]) => value!));
    for (const value of transitions) {
      for (const part of value.split(",")) expect(part.trim().split(/\s+/)[0], value).toMatch(/^(transform|opacity|grid-template-rows)$/);
    }
  });

  it("runs overlays 240 in and 160 out, and toasts 180 in and 120 out", () => {
    const overlays = styles("motion-overlays.css");
    expect(overlays).toContain("--sw-overlay-in: var(--sw-dur-slow)");
    expect(overlays).toContain("--sw-overlay-out: calc(var(--sw-dur-slow) * 2 / 3)");
    expect(overlays).toContain("--sw-toast-in: var(--sw-dur-base)");
    expect(overlays).toContain("--sw-toast-out: var(--sw-dur-fast)");
  });
});

describe("route transition speed", () => {
  it("starts at once and lasts no more than base (180ms), so it never delays content", () => {
    const css = styles("motion-route.css");
    const rules = [...css.matchAll(/animation:\s*sw-route-in([^;]+);/g)].map(([, value]) => value!);
    expect(rules.length).toBeGreaterThan(0);
    for (const value of rules) {
      expect(value).toContain("var(--sw-dur-base)");
      expect(value).not.toContain("calc(");
    }
  });
});
