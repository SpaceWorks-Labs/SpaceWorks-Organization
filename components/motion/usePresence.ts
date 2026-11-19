"use client";

import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { canAnimate, exitWait, MOTION_MS } from "./reducedMotion";
import { dropExited, mergeExiting, presenceReducer, type ExitingItem, type PresencePhase } from "./presence";

/**
 * Keeps a layer mounted while its exit plays (kit motion/overlays, motion/collapse).
 *
 * `present` replaces an `if (!open) return null` guard; `closing` is true during the exit (put `state` on
 * `data-state`, and make the layer `inert` so it takes no focus or clicks). `onAnimationEnd` finishes early; a timer
 * finishes when no animation ever ran. Without animation support (tests, reduced motion) `present === open`.
 * Radix overlays (Dialog, DropdownMenu, Popover, Select) have this built in: their CSS exit keyframes are enough.
 */
export function usePresence(open: boolean, exitMs: number = MOTION_MS.overlayOut) {
  const [phase, setPhase] = useState<PresencePhase>(open ? "open" : "closed");
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    setPhase((current) => presenceReducer(current, open ? { type: "show" } : { type: "hide", animated: canAnimate() }));
  }
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase((current) => presenceReducer(current, { type: "exited" })), exitWait(exitMs, true));
    return () => clearTimeout(timer);
  }, [phase, exitMs]);
  const closing = phase === "closing";
  const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (closing && event.target === event.currentTarget) setPhase((current) => presenceReducer(current, { type: "exited" }));
  };
  return { present: phase !== "closed", closing, state: closing ? "closed" : "open", onAnimationEnd } as const;
}

/** usePresence for a list: rows that leave `items` stay, flagged `leaving`, until their exit ends (toasts). */
export function useExitingItems<T>(items: readonly T[], keyOf: (item: T) => string | number, exitMs: number = MOTION_MS.toastOut): ExitingItem<T>[] {
  const [view, setView] = useState<ExitingItem<T>[]>(() => items.map((item) => ({ item, leaving: false })));
  const [source, setSource] = useState(items);
  const keyRef = useRef(keyOf);
  useEffect(() => {
    keyRef.current = keyOf;
  });
  if (source !== items) {
    setSource(items);
    setView((previous) => (canAnimate() ? mergeExiting(previous, items, keyOf) : items.map((item) => ({ item, leaving: false }))));
  }
  const timers = useRef(new Map<string | number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const row of view) {
      if (!row.leaving) continue;
      const key = keyRef.current(row.item);
      if (timers.current.has(key)) continue;
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          setView((current) => dropExited(current, key, keyRef.current));
        }, exitWait(exitMs, true)),
      );
    }
  }, [view, exitMs]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  return view;
}
