"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { canAnimate } from "@/components/motion/reducedMotion";
import { BOX_MARKUP } from "./markup";
import { BOX_HOVER_END, BOX_HOVER_MS, boxGroundColour, ensureBoxStylesheet } from "./stylesheet";

/** Where the symbol sits inside each master's viewBox (lockups draw the 136 x 126 symbol from the origin). */
const SYMBOL_BOX = {
  symbol: { w: 136, h: 126, vw: 136, vh: 126 },
  "lockup-stacked": { w: 136 * 1.0084, h: 126 * 1.0084, vw: 360, vh: 128 },
  "lockup-horizontal": { w: 136 * 0.45714, h: 57.6, vw: 360, vh: 58 },
} as const;

export type LogoShape = keyof typeof SYMBOL_BOX;

function focusVisible(target: EventTarget | null) {
  try {
    return target instanceof Element && target.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * The hover/focus cycle laid over the symbol part of a Space Works mark (CR-MOTION-01, kit motion/box-open): the box
 * folds shut from the resting logo, then opens back to it (600 + 1600ms), so nothing snaps at either end.
 * - Starts on pointer-enter of the host link or button (mouse or pen, never touch) or on its keyboard focus-visible.
 * - Once started it always finishes: leaving mid-way does not cut it, re-entering while it runs does not restart it.
 * - Never starts under reduced motion. Mounted artwork only while playing, so at rest the static master is all there is.
 * `ground` forces the artwork for a surface that never changes with the theme; otherwise it follows `html.dark`.
 * `mono` is the one-colour ink mark (light surfaces only).
 */
export function LogoBoxOverlay({ shape, width, height, ground, mono }: { shape: LogoShape; width: number; height: number; ground?: "light" | "dark"; mono: boolean }) {
  const box = SYMBOL_BOX[shape];
  const root = useRef<HTMLSpanElement>(null);
  const running = useRef(false);
  const [play, setPlay] = useState<{ dark: boolean; ground?: string } | null>(null);

  useEffect(() => {
    const overlay = root.current;
    const mark = overlay?.parentElement;
    if (!overlay || !mark) return;
    const host = mark.closest("a, button") ?? mark;
    let alive = true;
    const start = () => {
      if (running.current || !canAnimate()) return;
      running.current = true;
      const dark = ground ? ground === "dark" : document.documentElement.classList.contains("dark");
      void ensureBoxStylesheet().then(() => {
        if (alive) setPlay({ dark, ground: boxGroundColour(mark) });
        else running.current = false;
      });
    };
    const onEnter = (event: Event) => {
      if ((event as PointerEvent).pointerType !== "touch") start();
    };
    const onFocus = (event: Event) => {
      if (focusVisible(event.target)) start();
    };
    const onEnd = (event: Event) => {
      if ((BOX_HOVER_END as readonly string[]).includes((event as AnimationEvent).animationName)) setPlay(null);
    };
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("focusin", onFocus);
    overlay.addEventListener("animationend", onEnd);
    return () => {
      alive = false;
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("focusin", onFocus);
      overlay.removeEventListener("animationend", onEnd);
    };
  }, [ground]);

  useEffect(() => {
    const mark = root.current?.parentElement;
    if (!play || !mark) return;
    mark.setAttribute("data-logo-playing", "");
    // Safety net when no animationend arrives (a hidden tab, a stylesheet that failed to load).
    const timer = window.setTimeout(() => setPlay(null), BOX_HOVER_MS + 250);
    return () => {
      window.clearTimeout(timer);
      mark.removeAttribute("data-logo-playing");
      running.current = false;
    };
  }, [play]);

  const useMono = mono && play !== null && !play.dark;
  const style = {
    ...(play?.ground ? { "--sw-ground": play.ground } : {}),
    ...(useMono ? { color: "#142C2A" } : {}),
  } as CSSProperties;
  return (
    <span ref={root} className="sw-logo-box" aria-hidden="true" style={{ left: 0, top: 0, width: (width * box.w) / box.vw, height: (height * box.h) / box.vh }}>
      {play ? <span className={`sw-box hov ${play.dark ? "g-dark" : "g-light"}${useMono ? " mono" : ""}`} style={style} dangerouslySetInnerHTML={{ __html: BOX_MARKUP }} /> : null}
    </span>
  );
}
