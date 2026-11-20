"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { GuideLine, SpacingHint } from "@/lib/cards/design/editor/snapping";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { SAFE_MARGIN_MM } from "../../canvasInteraction";
import { SelectionFrame } from "./SelectionFrame";
import type { TransformMode } from "./transformMath";
import type { Live } from "./useCanvasTransform";
import type { GuideAxis, GuidesApi } from "./useGuides";

/** Print bleed drawn outside the trim. */
export const BLEED_MM = 2;
/** Guide lines run this far past the card's edges. */
const OVERHANG_PX = 10;

export type Overlays = { grid: boolean; bleed: boolean; safe: boolean; rulers: boolean };

/**
 * Everything the designer draws over the card: bleed and safe-zone lines, custom guides, smart
 * guides and spacing while dragging, the marquee and the selection frame.
 */
export function CanvasOverlay({ pxPerMm, card, selected, live, overlays, guides, onGuideDown, onHandleDown }: {
  pxPerMm: number;
  card: { widthMm: number; heightMm: number };
  selected: CardLayer[];
  live: Live;
  overlays: Overlays;
  guides: GuidesApi;
  onGuideDown: (axis: GuideAxis, index: number, event: PointerEvent<HTMLElement>) => void;
  onHandleDown: (mode: TransformMode, event: PointerEvent<HTMLElement>) => void;
}) {
  const px = (mm: number) => mm * pxPerMm;
  const line = (axis: "x" | "y", at: number, from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY): CSSProperties => {
    const span = axis === "x" ? card.heightMm : card.widthMm;
    const start = Number.isFinite(from) ? px(from) : -OVERHANG_PX;
    const end = Number.isFinite(to) ? px(to) : px(span) + OVERHANG_PX;
    return axis === "x"
      ? { position: "absolute", left: px(at), top: start, height: Math.max(1, end - start), width: 1 }
      : { position: "absolute", top: px(at), left: start, width: Math.max(1, end - start), height: 1 };
  };
  const guideKeys = (axis: GuideAxis, index: number) => (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 5 : 0.5;
    const moves: Record<string, number> = axis === "x" ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
    if (event.key === "Delete" || event.key === "Backspace") guides.remove(axis, index);
    else if (moves[event.key] !== undefined) guides.nudge(axis, index, moves[event.key]!);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {overlays.bleed ? <span aria-hidden className="absolute border border-dashed border-danger-solid" style={{ inset: -px(BLEED_MM) }} /> : null}
      {overlays.safe ? <span aria-hidden className="absolute border border-dashed border-primary opacity-50" style={{ inset: px(SAFE_MARGIN_MM) }} /> : null}

      {(["x", "y"] as const).flatMap((axis) => guides.guides[axis].map((at, index) => (
        <span
          key={`${axis}${index}`}
          role="separator"
          tabIndex={0}
          aria-orientation={axis === "x" ? "vertical" : "horizontal"}
          aria-valuenow={at}
          aria-valuemin={0}
          aria-valuemax={axis === "x" ? card.widthMm : card.heightMm}
          aria-label={`${axis === "x" ? "Vertical" : "Horizontal"} guide at ${at} mm. Arrow keys move it; Delete removes it.`}
          data-guide
          onPointerDown={(event) => onGuideDown(axis, index, event)}
          onKeyDown={guideKeys(axis, index)}
          className="pointer-events-auto flex justify-center outline-none focus-visible:[&>span]:bg-ink"
          style={{ ...line(axis, at), ...(axis === "x" ? { width: 9, marginLeft: -4, cursor: "col-resize" } : { height: 9, marginTop: -4, flexDirection: "column", cursor: "row-resize" }), touchAction: "none" }}
        >
          <span className={axis === "x" ? "h-full w-px bg-primary" : "h-px w-full bg-primary"} />
        </span>
      )))}
      {guides.dragging ? <span aria-hidden className="bg-primary" style={line(guides.dragging.axis, guides.dragging.at)} /> : null}

      {live.guides.map((guide: GuideLine) => <span key={`${guide.axis}${guide.at}`} aria-hidden className="bg-accent" style={line(guide.axis, guide.at, guide.from, guide.to)} />)}
      {live.spacing.map((hint: SpacingHint) => {
        const across = hint.axis === "x";
        const style: CSSProperties = across
          ? { position: "absolute", left: px(hint.from), top: px(hint.cross), width: px(hint.to - hint.from), height: 1 }
          : { position: "absolute", top: px(hint.from), left: px(hint.cross), height: px(hint.to - hint.from), width: 1 };
        return (
          <span key={`${hint.axis}${hint.from}`} aria-hidden className={hint.equal ? "bg-accent" : "bg-info-solid"} style={style}>
            <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-1.5 text-[10px] leading-4 tabular-nums ${hint.equal ? "bg-accent text-on-accent" : "bg-info-solid text-on-info"}`}>
              {hint.gapMm} mm
            </span>
          </span>
        );
      })}
      {live.marquee ? <span aria-hidden className="absolute border border-primary bg-primary/10" style={{ left: px(live.marquee.x), top: px(live.marquee.y), width: px(live.marquee.w), height: px(live.marquee.h) }} /> : null}

      <SelectionFrame layers={selected} pxPerMm={pxPerMm} onHandleDown={onHandleDown} />
    </div>
  );
}
