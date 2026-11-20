"use client";

import { useState, type PointerEvent } from "react";
import { round1 } from "@/lib/cards/design/editor/bounds";
import { follow, pointOnCard } from "./pointer";

/*
 * Custom guides: drag from a ruler onto the card to place one (from the top ruler: a horizontal guide,
 * stored in `y`; from the left ruler: a vertical guide, in `x`), drag it back off the card to remove
 * it. They live in the designer only and are never saved with the design. Focused guides move with
 * the arrow keys and go with Delete.
 */

export type GuideAxis = "x" | "y";
export type Guides = { x: number[]; y: number[] };
/** Guides may sit this far outside the card (over the bleed) before dropping them removes them. */
const OUTSIDE_MM = 2;

export function useGuides(card: { widthMm: number; heightMm: number }) {
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [dragging, setDragging] = useState<{ axis: GuideAxis; at: number } | null>(null);
  const limit = (axis: GuideAxis) => (axis === "x" ? card.widthMm : card.heightMm);
  const onCard = (axis: GuideAxis, at: number) => at >= -OUTSIDE_MM && at <= limit(axis) + OUTSIDE_MM;
  const without = (axis: GuideAxis, index: number) => ({ ...guides, [axis]: guides[axis].filter((_, at) => at !== index) });

  return {
    guides,
    dragging,
    /** Start dragging a new guide (`index` null) or an existing one. */
    startDrag(axis: GuideAxis, index: number | null, event: PointerEvent<HTMLElement>, frame: Element, pxPerMm: number) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const base = index === null ? guides : without(axis, index);
      if (index !== null) setGuides(base);
      const at = (move: { clientX: number; clientY: number }) => round1(pointOnCard(frame, move, pxPerMm)[axis]);
      setDragging({ axis, at: at(event) });
      follow((move) => setDragging({ axis, at: at(move) }), (end) => {
        setDragging(null);
        const position = at(end);
        if (onCard(axis, position)) setGuides({ ...base, [axis]: [...base[axis], position] });
      });
    },
    nudge(axis: GuideAxis, index: number, deltaMm: number) {
      setGuides({ ...guides, [axis]: guides[axis].map((value, at) => (at === index ? round1(Math.min(limit(axis), Math.max(0, value + deltaMm))) : value)) });
    },
    add: (axis: GuideAxis) => setGuides({ ...guides, [axis]: [...guides[axis], round1(limit(axis) / 2)] }),
    remove: (axis: GuideAxis, index: number) => setGuides(without(axis, index)),
    clear: () => setGuides({ x: [], y: [] }),
    count: guides.x.length + guides.y.length,
  };
}

export type GuidesApi = ReturnType<typeof useGuides>;
