/*
 * The cold-start splash's ending (kit whats-new v2.0 §2: "the box opens, then flies into the header logo"). Once the
 * 1600 ms opening ends, the box rises and shrinks onto the header's Space Works mark (FLIP: measure the mark, animate
 * transform only) while the canvas ground fades, then the real mark, hidden during the flight, shows in the same
 * spot. With no measurable mark (scrolled away, the phone header's app-icon tile) the layer fades in place as
 * before. Durations and curves are read from the motion tokens. Browser only; the CSS fade in landing.css stays the
 * ending without JavaScript or the Web Animations API.
 */

/** Marks the home link whose Space Works artwork the splash lands on (BrandHomeLink in SiteHeader). */
export const SPLASH_TARGET_ATTR = "data-splash-target";

/** CR-MOTION-01's named box-opening exception. */
const OPEN_MS = 1600;
/** Where the symbol sits inside the horizontal lockup's 360 × 58 artwork (its clipped nested viewport). */
const LOCKUP_SYMBOL = { width: 61.8462 / 360, height: 57.6 / 58 };

type Box = { left: number; top: number; width: number; height: number };

function token(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function tokenMs(name: string, fallback: string) {
  const value = token(name, fallback);
  return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

/** The header mark's symbol, when it is drawn and wholly on screen. */
function headerMark(): { svg: SVGSVGElement; box: Box } | null {
  for (const svg of document.querySelectorAll<SVGSVGElement>(`[${SPLASH_TARGET_ATTR}] svg[viewBox]`)) {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.top < 0 || rect.bottom > window.innerHeight) continue;
    const lockup = svg.viewBox.baseVal.width > 200;
    const box = lockup
      ? { left: rect.left, top: rect.top, width: rect.width * LOCKUP_SYMBOL.width, height: rect.height * LOCKUP_SYMBOL.height }
      : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    return { svg, box };
  }
  return null;
}

/**
 * Ends the splash. Resolves true once the layer has finished (landed or faded) and can be removed; false when it
 * left the CSS fade in charge (no Web Animations API, reduced motion, or the fade had already begun). Call it once per
 * splash: it cancels the CSS fade it replaces.
 */
export async function flySplash(splash: HTMLElement, ground: HTMLElement, mark: HTMLElement): Promise<boolean> {
  if (typeof splash.animate !== "function" || typeof splash.getAnimations !== "function") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const cssFade = splash.getAnimations().find((animation) => (animation as CSSAnimation).animationName === "sw-splash-out");
  const elapsed = Number(cssFade?.currentTime ?? 0);
  if (!cssFade || elapsed >= OPEN_MS) return false;
  cssFade.cancel();

  const slow = tokenMs("--sw-dur-slow", "240ms");
  const enter = token("--sw-ease-enter", "cubic-bezier(0.16, 1, 0.3, 1)");
  const standard = token("--sw-ease-standard", "cubic-bezier(0.2, 0, 0, 1)");
  const exit = token("--sw-ease-exit", "cubic-bezier(0.4, 0, 1, 1)");
  const opening = mark.getAnimations({ subtree: true }).filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
  await Promise.all([wait(OPEN_MS - elapsed), ...opening.map((animation) => animation.finished.catch(() => undefined))]);

  const target = headerMark();
  if (!target) {
    // Nothing to land on: the layer fades in place, as the CSS ending does.
    await splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: slow, easing: exit, fill: "forwards" }).finished.catch(() => undefined);
    return true;
  }

  const from = mark.getBoundingClientRect();
  const { box } = target;
  const scale = box.height / from.height;
  const timing: KeyframeAnimationOptions = { duration: slow * 2, fill: "forwards" };
  target.svg.style.visibility = "hidden";
  try {
    await Promise.all([
      mark.animate(
        [{ transform: "none" }, { transform: `translate(${box.left - from.left}px, ${box.top - from.top}px) scale(${scale})` }],
        { ...timing, easing: enter },
      ).finished,
      ground.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, easing: standard }).finished,
    ]);
  } catch {
    // An interrupted flight still hands over to the real mark.
  } finally {
    target.svg.style.visibility = "";
  }
  return true;
}
