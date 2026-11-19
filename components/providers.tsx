"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { TooltipProvider } from "@/components/ui/menu";
import { installAriaDisabledGuard } from "@/lib/ariaDisabled";
import type { ColorMode, PaintedColorMode } from "@/lib/colorMode";
import { paintColorMode, readColorMode, readPaintedColorMode, resolvePaintedColorMode, saveColorMode, watchColorMode } from "@/lib/colorModeClient";

const CHANGE_EVENT = "swo:theme-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

/** Tell React (and anything else listening for swo:theme-change) in the same frame the tokens change. */
function announce() {
  flushSync(() => window.dispatchEvent(new Event(CHANGE_EVENT)));
}

type ColorModeOrigin = { x: number; y: number };

const ColorModeContext = createContext<{
  /** The painted mode (what the page shows now). */
  mode: PaintedColorMode;
  /** The person's choice: light, dark or system. */
  preference: ColorMode;
  /** Pass the click point to reveal the new mode from there. Flips the painted mode into a fixed choice. */
  toggleColorMode: (origin?: ColorModeOrigin) => void;
  setColorMode: (next: ColorMode, origin?: ColorModeOrigin) => void;
} | null>(null);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The feathered edge animates a registered custom property (see app/styles/motion.css). */
function supportsFeatheredReveal() {
  return typeof CSS !== "undefined" && typeof CSS.registerProperty === "function" && CSS.supports("mask-image", "radial-gradient(circle, #000, transparent)");
}

/** Token timing for the reveal (kit motion/theme-reveal): 3 × --sw-dur-slow on the standard curve. */
function revealTiming() {
  const style = getComputedStyle(document.documentElement);
  const slow = Number.parseFloat(style.getPropertyValue("--sw-dur-slow")) || 240;
  return { duration: slow * 3, easing: style.getPropertyValue("--sw-ease-standard").trim() || "cubic-bezier(0.2, 0, 0, 1)" };
}

/**
 * Switch modes in a single frame, then animate: a soft-edged circle grows from
 * the picker where View Transitions are supported (720ms, the named theme-reveal
 * exception in CR-MOTION-01), otherwise a gentle colour cross-fade. Reduced-motion
 * users get an instant switch.
 */
function transitionColorMode(commit: () => void, origin?: ColorModeOrigin) {
  const root = document.documentElement;
  if (prefersReducedMotion()) {
    commit();
    return;
  }
  type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void> } };
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== "function") {
    root.classList.add("sw-theme-fade");
    commit();
    window.setTimeout(() => root.classList.remove("sw-theme-fade"), 460);
    return;
  }
  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 32;
  const feather = 160;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + feather;
  const feathered = supportsFeatheredReveal();
  root.style.setProperty("--sw-reveal-x", `${x}px`);
  root.style.setProperty("--sw-reveal-y", `${y}px`);
  root.classList.add(feathered ? "sw-theme-reveal-soft" : "sw-theme-reveal");
  const cleanUp = () => {
    root.classList.remove("sw-theme-reveal", "sw-theme-reveal-soft");
    root.style.removeProperty("--sw-reveal-x");
    root.style.removeProperty("--sw-reveal-y");
  };
  const transition = doc.startViewTransition(commit);
  // Hold the final frame: without fill the mask snaps back to 0 for a frame
  // before the transition tears down, flashing the old mode.
  const timing: KeyframeAnimationOptions = { ...revealTiming(), fill: "forwards", pseudoElement: "::view-transition-new(root)" };
  transition.ready
    .then(() => {
      root.animate(
        feathered
          ? { "--sw-reveal": ["0px", `${radius}px`] }
          : { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        timing,
      );
    })
    .catch(cleanUp);
  transition.finished.finally(cleanUp);
}

export function useAppColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error("useAppColorMode must be used inside Providers.");
  return context;
}

/**
 * Light unless the person picks Dark or System (CR-THEME-01). The choice lives in the swo.theme cookie, which
 * the root layout reads to render a fixed choice on <html>; the boot script there paints System before first
 * paint. Other tabs follow through the storage event, and the device only while System is chosen.
 */
export function Providers({ children, initialColorMode, session }: { children: React.ReactNode; initialColorMode: ColorMode; session?: Session | null }) {
  const mode = useSyncExternalStore<PaintedColorMode>(subscribe, readPaintedColorMode, () => (initialColorMode === "dark" ? "dark" : "light"));
  const preference = useSyncExternalStore<ColorMode>(subscribe, readColorMode, () => initialColorMode);

  useEffect(() => {
    // Re-sync after hydration (the meta colour may have rendered after the boot script), then keep in step.
    paintColorMode(resolvePaintedColorMode());
    window.dispatchEvent(new Event(CHANGE_EVENT));
    const stopWatching = watchColorMode(announce);
    const stopGuard = installAriaDisabledGuard();
    return () => {
      stopWatching();
      stopGuard();
    };
  }, []);

  const colorMode = useMemo(() => {
    const setColorMode = (next: ColorMode, origin?: ColorModeOrigin) => {
      const painted = resolvePaintedColorMode(next);
      const commit = () => {
        // Tokens and React state (icons, labels) change in the same frame.
        saveColorMode(next);
        paintColorMode(painted);
        announce();
      };
      if (painted === readPaintedColorMode()) commit();
      else transitionColorMode(commit, origin);
    };
    return {
      mode,
      preference,
      setColorMode,
      toggleColorMode: (origin?: ColorModeOrigin) => setColorMode(mode === "dark" ? "light" : "dark", origin),
    };
  }, [mode, preference]);

  return (
    <SessionProvider session={session}>
      <ColorModeContext.Provider value={colorMode}>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
