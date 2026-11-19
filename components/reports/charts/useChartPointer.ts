"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** The container's width, kept current, so charts draw at real pixels instead of stretching text. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      setWidth(Math.max(240, Math.round(node.getBoundingClientRect().width)));
      setMeasured(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Until measured (server render, first paint) the SVG scales to its box instead of forcing 640px.
  return { ref, width, svgWidth: measured ? width : ("100%" as const) };
}

/**
 * Hover and keyboard focus over x positions: the pointer snaps to the nearest index, arrow keys step,
 * Home/End jump, Escape clears. One handler set for line, area and column charts.
 */
export function useIndexFocus(count: number, xOf: (index: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const onPointerMove = useCallback(
    (event: PointerEvent<SVGElement>) => {
      const box = (event.currentTarget as SVGElement).getBoundingClientRect();
      const x = event.clientX - box.left;
      let best = 0;
      for (let i = 1; i < count; i += 1) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
      setIndex(count ? best : null);
    },
    [count, xOf],
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!count) return;
      const keys: Record<string, (current: number) => number> = {
        ArrowRight: (current) => Math.min(count - 1, current + 1),
        ArrowLeft: (current) => Math.max(0, current - 1),
        Home: () => 0,
        End: () => count - 1,
      };
      if (event.key === "Escape") return setIndex(null);
      const move = keys[event.key];
      if (!move) return;
      event.preventDefault();
      setIndex((current) => move(current ?? count - 1));
    },
    [count],
  );
  return { index, setIndex, onPointerMove, onPointerLeave: () => setIndex(null), onKeyDown, onBlur: () => setIndex(null) };
}

export { MAX_SERIES_SLOT, slotColor } from "./slots";
