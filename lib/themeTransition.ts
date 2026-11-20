import type { ColorMode } from "@/lib/colorMode";

/**
 * The theme reveal, ported from SpaceWorks-Design motion/theme-reveal (theme-reveal.js through
 * react/themeTransition.ts; current rule v2.0.1, CR-MOTION-01): one page-snapshot circle grows from the toggle over
 * --sw-theme-duration (slow × 3 = 720ms) on the standard curve. clip-path is the documented snapshot exception.
 * A second request while it runs reverses the same mask from its current radius. Without View Transitions, or under
 * reduced motion, the theme changes immediately. The app owns persistence and painting (`paint`); this owns only
 * the snapshot pair. CSS: app/styles/theme-reveal.css.
 */
type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
type StartViewTransition = (update: () => void) => ViewTransitionLike;

type Reveal = {
  targetDark: boolean;
  desiredDark: boolean;
  next: ColorMode;
  paint: (next: ColorMode) => void;
  applied: boolean;
  animation: Animation | null;
  transition: ViewTransitionLike | null;
  done: Promise<void>;
};

const REDUCED = "(prefers-reduced-motion: reduce)";
/** The class on <html> that scopes the ::view-transition rules to this reveal. */
export const THEME_REVEAL_CLASS = "sw-theme-reveal";

let active: Reveal | null = null;
let watchingReducedMotion = false;

function reducedMotion() {
  try {
    return window.matchMedia(REDUCED).matches;
  } catch {
    return false;
  }
}

/** Turning reduced motion on mid-reveal ends it at once. */
function watchReducedMotion() {
  if (watchingReducedMotion) return;
  watchingReducedMotion = true;
  try {
    window.matchMedia(REDUCED).addEventListener("change", (event) => {
      if (event.matches) active?.transition?.skipTransition();
    });
  } catch {
    /* no matchMedia: nothing to follow */
  }
}

/** --sw-theme-duration and --sw-ease-standard, resolved from the tokens (no literal timing). */
function timing() {
  const root = document.documentElement;
  const probe = document.createElement("span");
  probe.style.transitionDuration = "var(--sw-theme-duration)";
  root.appendChild(probe);
  const time = getComputedStyle(probe).transitionDuration;
  probe.remove();
  return {
    duration: Number.parseFloat(time) * (time.endsWith("ms") ? 1 : 1000) || 0,
    easing: getComputedStyle(root).getPropertyValue("--sw-ease-standard").trim() || "ease",
  };
}

/** Switch to `next`, revealing it from the centre of `originEl` (top right when there is none). */
export function switchColorMode(next: ColorMode, originEl: Element | null | undefined, paint: (next: ColorMode) => void): Promise<void> {
  const root = document.documentElement;
  const dark = next === "dark";
  watchReducedMotion();
  if (active) {
    // Both snapshots stay alive: reverse the existing mask from its current radius.
    const running = active;
    running.desiredDark = dark;
    running.next = next;
    running.paint = paint;
    if (running.applied) paint(next);
    if (reducedMotion()) {
      running.transition?.skipTransition();
      return running.done;
    }
    if (running.animation) {
      running.animation.updatePlaybackRate(dark === running.targetDark ? 1 : -1);
      running.animation.play();
    }
    return running.done;
  }
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (reducedMotion() || typeof start !== "function" || dark === root.classList.contains("dark")) {
    paint(next);
    return Promise.resolve();
  }
  const rect = originEl?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
  const y = rect ? rect.top + rect.height / 2 : 32;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.classList.add(THEME_REVEAL_CLASS);
  const state: Reveal = { targetDark: dark, desiredDark: dark, next, paint, applied: false, animation: null, transition: null, done: Promise.resolve() };
  active = state;
  const apply = () => {
    if (state.applied) return;
    state.applied = true;
    state.targetDark = state.next === "dark";
    state.paint(state.next);
  };
  const clean = () => {
    if (active !== state) return;
    root.classList.remove(THEME_REVEAL_CLASS);
    active = null;
  };
  try {
    // Called on document (an unbound call throws); the theme is painted inside the callback, after the old snapshot.
    const transition = start.call(document, apply);
    state.transition = transition;
    transition.ready
      .then(() => {
        if (active !== state || reducedMotion()) {
          transition.skipTransition();
          return;
        }
        // clip-path is the documented page-snapshot exception; no surface repaints. fill holds the final frame so
        // the old theme never flashes back.
        state.animation = root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { ...timing(), fill: "both", pseudoElement: "::view-transition-new(root)" },
        );
        if (state.desiredDark !== state.targetDark) {
          state.animation.updatePlaybackRate(-1);
          state.animation.play();
        }
      })
      .catch(() => {
        apply();
        clean();
      });
    state.done = transition.finished.then(clean, clean);
    return state.done;
  } catch {
    apply();
    clean();
    return Promise.resolve();
  }
}
