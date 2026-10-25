"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { PT_TO_MM } from "@/lib/cards/design/elements";
import { resizeBox, rotationTowards, type Box, type Handle } from "@/lib/cards/design/layerEdit";
import { fillLayerText, type CardLayer } from "@/lib/cards/design/layers";
import { monoColour } from "@/lib/cards/layerLayout";
import type { CardHolder } from "@/lib/cards/types";
import { cardFontStack } from "./cardFonts";
import type { CanvasInteraction } from "./canvasInteraction";

/*
 * One of a side's own layers on the canvas, drawn as the server renderer draws it (lib/cards/
 * layerLayout.ts): the box turned about its centre and faded as a whole. In the designer it can be
 * dragged, and the selected one gets a frame (LayerSelection, drawn outside the card's clipping) with
 * eight resize handles and a knob to turn it.
 */

const HANDLES: Handle[] = [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }];
const CURSORS: Record<string, string> = { "-1-1": "nwse-resize", "0-1": "ns-resize", "1-1": "nesw-resize", "10": "ew-resize", "11": "nwse-resize", "01": "ns-resize", "-11": "nesw-resize", "-10": "ew-resize" };

type Mode = "move" | "rotate" | Handle;

export function layerLabel(layer: CardLayer) {
  if (layer.name) return layer.name;
  if (layer.kind === "text") return layer.text.replace(/\s+/g, " ").trim().slice(0, 30) || "Empty text";
  return { image: "Image", rect: "Rectangle", ellipse: "Ellipse", line: "Line" }[layer.kind];
}

const boxOf = (layer: CardLayer): Box => ({ xMm: layer.xMm, yMm: layer.yMm, wMm: layer.wMm, hMm: layer.hMm, rotationDeg: layer.rotationDeg });

function frameStyle(layer: CardLayer, pxPerMm: number): CSSProperties {
  const px = (mm: number) => `${mm * pxPerMm}px`;
  return { position: "absolute", left: px(layer.xMm), top: px(layer.yMm), width: px(layer.wMm), height: px(layer.hMm), transform: layer.rotationDeg ? `rotate(${layer.rotationDeg}deg)` : undefined, transformOrigin: "center" };
}

/** Pointer handlers for moving, resizing and turning one layer; positions go back through `interaction`. */
function useLayerDrag(layer: CardLayer, pxPerMm: number, interaction?: CanvasInteraction) {
  const drag = useRef<{ mode: Mode; startX: number; startY: number; box: Box } | null>(null);
  const editable = Boolean(interaction) && !layer.locked;
  const start = (mode: Mode) => (event: PointerEvent<HTMLElement>) => {
    if (!interaction || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interaction.onSelect(layer.id);
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.onBeginChange();
    drag.current = { mode, startX: event.clientX, startY: event.clientY, box: boxOf(layer) };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || !interaction) return;
    const dx = (event.clientX - current.startX) / pxPerMm;
    const dy = (event.clientY - current.startY) / pxPerMm;
    if (current.mode === "move") {
      interaction.onLayerMove(layer.id, current.box.xMm + dx, current.box.yMm + dy, !event.altKey);
    } else if (current.mode === "rotate") {
      const card = event.currentTarget.closest("[data-card-frame]")!.getBoundingClientRect();
      interaction.onLayerChange(layer.id, { rotationDeg: rotationTowards(current.box, { xMm: (event.clientX - card.left) / pxPerMm, yMm: (event.clientY - card.top) / pxPerMm }, event.shiftKey) });
    } else {
      const corner = current.mode.x !== 0 && current.mode.y !== 0;
      // Pictures keep their shape from a corner unless Shift is held; everything else only with Shift.
      const keepAspect = corner && (layer.kind === "image" ? !event.shiftKey : event.shiftKey);
      const { xMm, yMm, wMm, hMm } = resizeBox(current.box, current.mode, dx, dy, keepAspect, { w: 1, h: layer.kind === "line" ? 0.1 : 1 });
      interaction.onLayerChange(layer.id, { xMm, yMm, wMm, hMm });
    }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.current?.mode === "move") interaction?.onLayerMoveEnd();
    drag.current = null;
  };
  return { editable, start, move, end };
}

export function CardLayerView({ layer, holder, pxPerMm, zIndex, mono, interaction }: { layer: CardLayer; holder: CardHolder; pxPerMm: number; zIndex: number; mono: boolean; interaction?: CanvasInteraction }) {
  const { editable, start, move, end } = useLayerDrag(layer, pxPerMm, interaction);
  if (layer.hidden) return null;
  const px = (mm: number) => `${mm * pxPerMm}px`;
  const colour = (hex: string) => (mono ? monoColour(hex) : hex);
  const nudge = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const offset = moves[event.key];
    if (!offset || !interaction || !editable) return;
    event.preventDefault();
    interaction.onBeginChange();
    interaction.onLayerChange(layer.id, { xMm: Math.round((layer.xMm + offset[0]) * 10) / 10, yMm: Math.round((layer.yMm + offset[1]) * 10) / 10 });
  };

  let content: ReactNode = null;
  let look: CSSProperties = {};
  if (layer.kind === "text") {
    look = { fontFamily: cardFontStack(layer.font), fontSize: px(layer.sizePt * PT_TO_MM), fontWeight: layer.bold ? 700 : 400, lineHeight: layer.lineHeight, letterSpacing: `${layer.trackingEm}em`, textAlign: layer.align, textTransform: layer.uppercase ? "uppercase" : undefined, color: mono ? "#000000" : layer.color, overflowWrap: "anywhere" };
    content = fillLayerText(layer.text, holder);
  } else if (layer.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- the organisation's own uploaded artwork, drawn to scale
    content = <img src={layer.url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: layer.fit, borderRadius: px(layer.radiusMm), filter: mono || layer.grayscale ? "grayscale(1)" : undefined }} />;
  } else if (layer.kind === "line") {
    look = { background: colour(layer.color) };
  } else {
    look = {
      background: layer.fill ? colour(layer.fill) : undefined,
      border: layer.stroke && layer.strokeMm > 0 ? `${Math.max(1, layer.strokeMm * pxPerMm)}px solid ${colour(layer.stroke)}` : undefined,
      borderRadius: layer.kind === "ellipse" ? "50%" : px(Math.min(layer.radiusMm, layer.wMm / 2, layer.hMm / 2)),
      boxSizing: "border-box",
    };
  }

  const itemProps = interaction
    ? { role: "button" as const, tabIndex: 0, "aria-label": `${layerLabel(layer)}. Arrow keys move it; hold Shift for bigger steps.`, "aria-pressed": interaction.selected === layer.id, onPointerDown: start("move"), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onFocus: () => interaction.onSelect(layer.id), onKeyDown: nudge }
    : {};
  return (
    <div {...itemProps} style={{ ...frameStyle(layer, pxPerMm), ...look, zIndex, opacity: layer.opacityPct / 100, cursor: editable ? "move" : interaction ? "pointer" : undefined, touchAction: interaction ? "none" : undefined, userSelect: interaction ? "none" : undefined }}>
      {content}
    </div>
  );
}

/** The selected layer's frame, handles and turning knob, drawn over the card so nothing clips them. */
export function LayerSelection({ layer, pxPerMm, interaction }: { layer: CardLayer; pxPerMm: number; interaction: CanvasInteraction }) {
  const { editable, start, move, end } = useLayerDrag(layer, pxPerMm, interaction);
  if (layer.hidden) return null;
  const handle = (mode: Mode) => ({ onPointerDown: start(mode), onPointerMove: move, onPointerUp: end, onPointerCancel: end });
  return (
    <div aria-hidden style={{ ...frameStyle(layer, pxPerMm), outline: `2px ${layer.locked ? "dashed" : "solid"} var(--color-primary)`, outlineOffset: 1, pointerEvents: "none" }}>
      {editable ? (
        <>
          {HANDLES.map((at) => (
            <span
              key={`${at.x}${at.y}`}
              {...handle(at)}
              className="absolute size-2.5 rounded-[2px] border border-primary bg-white"
              style={{ left: `calc(${(at.x + 1) * 50}% - 5px)`, top: `calc(${(at.y + 1) * 50}% - 5px)`, cursor: CURSORS[`${at.x}${at.y}`], pointerEvents: "auto", touchAction: "none" }}
            />
          ))}
          <span aria-hidden className="absolute left-1/2 top-[-18px] h-[14px] w-px -translate-x-1/2 bg-primary" />
          <span
            {...handle("rotate")}
            title="Drag to turn. Hold Shift for 15° steps."
            className="absolute left-1/2 top-[-26px] size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-white"
            style={{ cursor: "grab", pointerEvents: "auto", touchAction: "none" }}
          />
        </>
      ) : null}
    </div>
  );
}
