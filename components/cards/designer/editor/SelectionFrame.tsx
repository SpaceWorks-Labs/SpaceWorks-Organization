"use client";

import type { CSSProperties, PointerEvent } from "react";
import { selectionBounds } from "@/lib/cards/design/editor/bounds";
import type { Handle } from "@/lib/cards/design/layerEdit";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { layerFrameStyle } from "../../CardLayerView";
import type { TransformMode } from "./transformMath";

const HANDLES: Handle[] = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }];
const CURSORS: Record<string, string> = { "-1-1": "nwse-resize", "0-1": "ns-resize", "1-1": "nesw-resize", "10": "ew-resize", "11": "nwse-resize", "01": "ns-resize", "-11": "nesw-resize", "-10": "ew-resize" };

/**
 * The selection's frame, drawn over the card so nothing clips it: one layer gets its own turned frame,
 * several get one upright frame around them all (with a thin outline on each). Eight handles resize
 * (Shift keeps proportions; pictures and groups keep them unless Shift is held) and the knob turns
 * (Shift: 15° steps). The Position panel does the same from the keyboard.
 */
export function SelectionFrame({ layers, pxPerMm, onHandleDown }: { layers: CardLayer[]; pxPerMm: number; onHandleDown: (mode: TransformMode, event: PointerEvent<HTMLElement>) => void }) {
  const shown = layers.filter((layer) => !layer.hidden);
  if (shown.length === 0) return null;
  const single = shown.length === 1 ? shown[0]! : null;
  const bounds = single ? null : selectionBounds(shown, shown.map((layer) => layer.id));
  const frame: CSSProperties = single
    ? layerFrameStyle(single, pxPerMm)
    : { position: "absolute", left: bounds!.x * pxPerMm, top: bounds!.y * pxPerMm, width: bounds!.w * pxPerMm, height: bounds!.h * pxPerMm };
  const editable = shown.some((layer) => !layer.locked);
  const handle = (mode: TransformMode) => ({
    "data-selection-handle": "",
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onHandleDown(mode, event);
    },
  });
  return (
    <>
      {single ? null : shown.map((layer) => (
        <span key={layer.id} aria-hidden style={{ ...layerFrameStyle(layer, pxPerMm), outline: "1px solid var(--color-primary)", opacity: 0.6, pointerEvents: "none" }} />
      ))}
      <div aria-hidden style={{ ...frame, outline: `2px ${editable ? "solid" : "dashed"} var(--color-primary)`, outlineOffset: 1, pointerEvents: "none" }}>
        {editable ? (
          <>
            {HANDLES.map((at) => (
              <span
                key={`${at.x}${at.y}`}
                {...handle(at)}
                className="absolute size-2.5 rounded-[2px] border border-primary bg-panel"
                style={{ left: `calc(${(at.x + 1) * 50}% - 5px)`, top: `calc(${(at.y + 1) * 50}% - 5px)`, cursor: CURSORS[`${at.x}${at.y}`], pointerEvents: "auto", touchAction: "none" }}
              />
            ))}
            <span className="absolute left-1/2 top-[-18px] h-[14px] w-px -translate-x-1/2 bg-primary" />
            <span
              {...handle("rotate")}
              title="Drag to turn. Hold Shift for 15° steps."
              className="absolute left-1/2 top-[-26px] size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-panel"
              style={{ cursor: "grab", pointerEvents: "auto", touchAction: "none" }}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
