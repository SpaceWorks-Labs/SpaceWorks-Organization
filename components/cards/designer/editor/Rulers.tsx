"use client";

import type { PointerEvent } from "react";
import { reword, useDesignerNoun } from "../wording";
import type { GuideAxis } from "./useGuides";

export const RULER_PX = 20;

/**
 * A millimetre ruler along the card's top (`axis` "x") or left edge ("y"). Dragging from it onto the
 * card places a guide across it: the top ruler gives horizontal guides, the left one vertical guides.
 */
export function Ruler({ axis, lengthMm, pxPerMm, onStartGuide }: { axis: "x" | "y"; lengthMm: number; pxPerMm: number; onStartGuide: (guideAxis: GuideAxis, event: PointerEvent<HTMLElement>) => void }) {
  const noun = useDesignerNoun();
  const horizontal = axis === "x";
  const length = lengthMm * pxPerMm;
  const step = pxPerMm >= 4 ? 1 : pxPerMm >= 2 ? 2 : 5;
  const labelEvery = pxPerMm >= 6 ? 5 : 10;
  const ticks: Array<{ at: number; size: number; label?: string }> = [];
  for (let mm = 0; mm <= lengthMm + 0.001; mm += step) {
    const rounded = Math.round(mm);
    const major = rounded % labelEvery === 0;
    ticks.push({ at: rounded * pxPerMm, size: major ? 10 : rounded % 5 === 0 ? 6 : 3, label: major ? String(rounded) : undefined });
  }
  return (
    <div
      data-ruler
      aria-hidden
      title={reword(horizontal ? "Drag down onto the card to add a horizontal guide" : "Drag right onto the card to add a vertical guide", noun)}
      onPointerDown={(event) => onStartGuide(horizontal ? "y" : "x", event)}
      className="absolute select-none border-line bg-canvas text-ink-muted"
      style={horizontal
        ? { left: RULER_PX, top: 0, width: length, height: RULER_PX, borderBottomWidth: 1, cursor: "row-resize", touchAction: "none" }
        : { left: 0, top: RULER_PX, width: RULER_PX, height: length, borderRightWidth: 1, cursor: "col-resize", touchAction: "none" }}
    >
      <svg width={horizontal ? length : RULER_PX} height={horizontal ? RULER_PX : length} className="block overflow-visible">
        {ticks.map((tick) => (
          <g key={tick.at}>
            {horizontal
              ? <line x1={tick.at} x2={tick.at} y1={RULER_PX} y2={RULER_PX - tick.size} stroke="currentColor" strokeWidth={1} />
              : <line y1={tick.at} y2={tick.at} x1={RULER_PX} x2={RULER_PX - tick.size} stroke="currentColor" strokeWidth={1} />}
            {tick.label && tick.at > 0
              ? horizontal
                ? <text x={tick.at + 2} y={9} fontSize={9} fill="currentColor">{tick.label}</text>
                : <text x={2} y={tick.at - 2} fontSize={9} fill="currentColor">{tick.label}</text>
              : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
