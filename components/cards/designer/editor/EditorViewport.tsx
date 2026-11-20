"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { follow } from "./pointer";
import { Ruler, RULER_PX } from "./Rulers";
import { isTypingTarget } from "./shortcuts";
import type { GuideAxis } from "./useGuides";
import type { ZoomApi } from "./useZoom";

/**
 * The scrolling, zooming area around the card, with millimetre rulers on its top and left. Scroll or
 * hold Space and drag to pan; Ctrl or Cmd with the wheel zooms (useZoom). A press on empty canvas is
 * handed to `onCanvasPointerDown` (marquee selection).
 */
export function EditorViewport({ zoom, widthMm, heightMm, rulers, onStartGuide, onCanvasPointerDown, children }: {
  zoom: ZoomApi;
  widthMm: number;
  heightMm: number;
  rulers: boolean;
  onStartGuide: (axis: GuideAxis, event: PointerEvent<HTMLElement>, frame: Element) => void;
  onCanvasPointerDown: (event: PointerEvent<HTMLElement>, frame: Element) => void;
  children: (pxPerMm: number) => ReactNode;
}) {
  const node = useRef<HTMLDivElement | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      const target = event.target as HTMLElement;
      // Space presses buttons; only take it over on the canvas itself.
      if (target !== document.body && !target.closest("[data-editor-viewport]")) return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const measure = zoom.ref;
  const attach = useCallback((element: HTMLDivElement | null) => {
    node.current = element;
    return measure(element);
  }, [measure]);
  // With both sides showing, the side being edited is marked `data-active-card`.
  const frame = () => node.current?.querySelector("[data-active-card] [data-card-frame]") ?? node.current?.querySelector("[data-card-frame]") ?? null;
  const startGuide = (axis: GuideAxis, event: PointerEvent<HTMLElement>) => {
    const card = frame();
    if (card) onStartGuide(axis, event, card);
  };
  const pxPerMm = zoom.pxPerMm;

  return (
    <div
      ref={attach}
      data-editor-viewport
      tabIndex={-1}
      aria-label="Card canvas"
      className={cn("relative min-h-[380px] flex-1 overflow-auto focus:outline-none", space && (panning ? "cursor-grabbing" : "cursor-grab"))}
      style={{ backgroundImage: "radial-gradient(circle, var(--color-line-strong) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      onPointerDownCapture={(event) => {
        node.current?.focus({ preventScroll: true });
        if (!space || event.button !== 0) return;
        // Space + drag pans instead of editing.
        event.preventDefault();
        event.stopPropagation();
        const start = { x: event.clientX, y: event.clientY, left: node.current?.scrollLeft ?? 0, top: node.current?.scrollTop ?? 0 };
        setPanning(true);
        follow((move) => node.current?.scrollTo({ left: start.left - (move.clientX - start.x), top: start.top - (move.clientY - start.y) }), () => setPanning(false));
      }}
      onPointerDown={(event) => {
        const card = frame();
        if (event.defaultPrevented || event.button !== 0 || !card) return;
        event.preventDefault();
        onCanvasPointerDown(event, card);
      }}
    >
      {/* Top-aligned: the row is as tall as the settings panel, so a centred card would sit below the fold. */}
      <div className="flex min-h-full w-max min-w-full items-start justify-center p-6">
        {zoom.measured ? (
          <div className="relative" style={{ paddingLeft: RULER_PX + 8, paddingTop: RULER_PX + 16 }}>
            {rulers ? (
              <div className="absolute" style={{ left: 8, top: 16 }}>
                <Ruler axis="x" lengthMm={widthMm} pxPerMm={pxPerMm} onStartGuide={startGuide} />
                <Ruler axis="y" lengthMm={heightMm} pxPerMm={pxPerMm} onStartGuide={startGuide} />
              </div>
            ) : null}
            {children(pxPerMm)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
