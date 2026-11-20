"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Zoom for the designer canvas. 100% is the card's real size on a standard screen (96 px per inch);
 * "Fit" sizes the card to the space. Ctrl or Cmd with the mouse wheel zooms, buttons and Ctrl +/−/0 step.
 */

export const PX_PER_MM_AT_100 = 96 / 25.4;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 400;
export const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200, 250, 300, 400] as const;
/** Room around the card inside the viewport, for the rulers and the selection's turning knob. */
export const VIEWPORT_PADDING_PX = 72;

type Box = { w: number; h: number };
type Card = { widthMm: number; heightMm: number };

export function fitPxPerMm(box: Box, card: Card) {
  if (!box.w) return 4;
  const fit = Math.min((box.w - VIEWPORT_PADDING_PX) / card.widthMm, (Math.max(box.h, 360) - VIEWPORT_PADDING_PX) / card.heightMm);
  return Math.min(12, Math.max(2, fit));
}

const clampPercent = (percent: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, percent)));

const percentOf = (value: { box: Box; zoom: number | "fit" }, size: Card) => (value.zoom === "fit" ? (fitPxPerMm(value.box, size) / PX_PER_MM_AT_100) * 100 : value.zoom);

/** The next zoom level up (`direction` 1) or down (-1) from `percent`. */
export function stepZoom(percent: number, direction: 1 | -1) {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > percent + 1) ?? ZOOM_MAX;
  return [...ZOOM_LEVELS].reverse().find((level) => level < percent - 1) ?? ZOOM_MIN;
}

export function useZoom(widthMm: number, heightMm: number) {
  const card = { widthMm, heightMm };
  const [state, setState] = useState<{ box: Box; zoom: number | "fit" }>({ box: { w: 0, h: 0 }, zoom: "fit" });
  const cardRef = useRef(card);
  useEffect(() => {
    cardRef.current = { widthMm, heightMm };
  }, [widthMm, heightMm]);

  /** Attach to the scrolling viewport: measures it and zooms on Ctrl/Cmd + wheel. */
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setState((value) => (value.box.w === width && value.box.h === height ? value : { ...value, box: { w: width, h: height } }));
    });
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setState((value) => ({ ...value, zoom: clampPercent(percentOf(value, cardRef.current) * (event.deltaY < 0 ? 1.1 : 1 / 1.1)) }));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  }, []);

  const percent = percentOf(state, card);
  return {
    ref,
    measured: state.box.w > 0,
    fitted: state.zoom === "fit",
    percent: Math.round(percent),
    pxPerMm: state.zoom === "fit" ? fitPxPerMm(state.box, card) : (state.zoom / 100) * PX_PER_MM_AT_100,
    zoomIn: () => setState((value) => ({ ...value, zoom: stepZoom(percentOf(value, card), 1) })),
    zoomOut: () => setState((value) => ({ ...value, zoom: stepZoom(percentOf(value, card), -1) })),
    fit: () => setState((value) => ({ ...value, zoom: "fit" })),
  };
}

export type ZoomApi = ReturnType<typeof useZoom>;
