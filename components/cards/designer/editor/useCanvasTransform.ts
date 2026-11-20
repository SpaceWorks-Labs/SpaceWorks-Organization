"use client";

import { useState, type PointerEvent } from "react";
import { intersects, layerBounds, rectFromPoints, selectionBounds, type Rect } from "@/lib/cards/design/editor/bounds";
import { expandToGroups, moveLayers } from "@/lib/cards/design/editor/groups";
import { equalSpacingTargets, snapRect, snapTargets, snapThresholdMm, spacingHints, type GuideLine, type SpacingHint } from "@/lib/cards/design/editor/snapping";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { SAFE_MARGIN_MM } from "../../canvasInteraction";
import { follow, pointOnCard } from "./pointer";
import { otherRects, resizeSelection, rotateSelection, type TransformMode } from "./transformMath";

export type Guides = { x: number[]; y: number[] };
export type Live = { guides: GuideLine[]; spacing: SpacingHint[]; marquee: Rect | null };
const IDLE: Live = { guides: [], spacing: [], marquee: null };

type Params = {
  side: () => CardSideSettings;
  pxPerMm: number;
  selection: readonly string[];
  setSelection: (ids: string[]) => void;
  /** Write the side's layers; `undoStep` true only for the first change of a drag. */
  writeLayers: (layers: CardLayer[], undoStep: boolean) => void;
  guides: Guides;
  snapToGrid: boolean;
  /** Boxes of built-in items to snap to. */
  itemRects: Rect[];
  /** Shift-press on a layer: add it (and its group) to the selection, or take it out. */
  toggle: (id: string) => void;
  /** A press while copying a style: lay it on the pressed layer instead of selecting. */
  paint: ((id: string) => void) | null;
};

/**
 * Moving, resizing and turning the selection with the pointer, with smart guides (Alt turns them
 * off), plus marquee selection on empty canvas. A drag is one undo step, taken on its first change.
 */
export function useCanvasTransform(params: Params) {
  const [live, setLive] = useState<Live>(IDLE);
  const { pxPerMm } = params;

  const targetsFor = (current: CardSideSettings, ids: string[], moving: Rect | null) => {
    const others = [...otherRects(current.layers, ids), ...params.itemRects];
    const targets = snapTargets({ widthMm: current.widthMm, heightMm: current.heightMm, safeMm: SAFE_MARGIN_MM, guides: params.guides }, others);
    return { others, targets: moving ? [...targets, ...equalSpacingTargets(moving, others)] : targets };
  };

  /** Start moving, resizing or turning the selection (`ids`). */
  const begin = (mode: TransformMode, event: PointerEvent<HTMLElement>, ids: string[]) => {
    const frame = event.currentTarget.closest("[data-card-frame]");
    const start = params.side();
    const movable = ids.filter((id) => start.layers.some((layer) => layer.id === id && !layer.locked));
    const bounds = selectionBounds(start.layers, movable);
    if (!frame || !bounds) return;
    const press = pointOnCard(frame, event, pxPerMm);
    const threshold = snapThresholdMm(pxPerMm);
    let changed = false;
    follow((move) => {
      const at = pointOnCard(frame, move, pxPerMm);
      const [dx, dy] = [at.x - press.x, at.y - press.y];
      if (!changed && Math.hypot(dx, dy) * pxPerMm < 2) return;
      const snap = !move.altKey;
      let layers: CardLayer[];
      let guides: GuideLine[] = [];
      let spacing: SpacingHint[] = [];
      if (mode === "move") {
        let moved = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
        const { others, targets } = targetsFor(start, movable, moved);
        let shift = { dx: 0, dy: 0 };
        if (snap) {
          const snapped = snapRect(moved, targets, threshold);
          const grid = start.gridSizeMm;
          const toGrid = (value: number) => (params.snapToGrid ? Math.round(value / grid) * grid - value : 0);
          shift = { dx: snapped.dx || toGrid(moved.x), dy: snapped.dy || toGrid(moved.y) };
          guides = snapped.guides;
        }
        moved = { ...moved, x: moved.x + shift.dx, y: moved.y + shift.dy };
        spacing = spacingHints(moved, others, start);
        layers = moveLayers(start.layers, movable, dx + shift.dx, dy + shift.dy);
      } else if (mode === "rotate") {
        layers = rotateSelection(start.layers, movable, bounds, press, at, move.shiftKey);
      } else {
        const result = resizeSelection(start.layers, movable, bounds, mode, dx, dy, move.shiftKey, snap ? { targets: targetsFor(start, movable, null).targets, threshold } : null);
        layers = result.layers;
        guides = result.guides;
      }
      params.writeLayers(layers, !changed);
      changed = true;
      setLive({ guides, spacing, marquee: null });
    }, () => setLive(IDLE));
  };

  return {
    live,
    begin,
    /** Press on a layer: copy a style onto it, toggle it with Shift, or select it and start moving. */
    onLayerPointerDown(id: string, event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      if (params.paint) return params.paint(id);
      if (event.shiftKey) return params.toggle(id);
      const ids = params.selection.includes(id) ? [...params.selection] : expandToGroups(params.side().layers, [id]);
      if (!params.selection.includes(id)) params.setSelection(ids);
      begin("move", event, ids);
    },
    /** Press on empty canvas: drag a marquee to select the layers it touches (Shift adds); a click clears. */
    onCanvasPointerDown(event: PointerEvent<HTMLElement>, frame: Element) {
      const press = pointOnCard(frame, event, pxPerMm);
      const additive = event.shiftKey;
      const before = additive ? [...params.selection] : [];
      const drag: { marquee: Rect | null } = { marquee: null };
      follow((move) => {
        drag.marquee = rectFromPoints(press, pointOnCard(frame, move, pxPerMm));
        setLive({ ...IDLE, marquee: drag.marquee });
      }, () => {
        setLive(IDLE);
        const marquee = drag.marquee;
        if (!marquee || (marquee.w * pxPerMm < 3 && marquee.h * pxPerMm < 3)) {
          if (!additive) params.setSelection([]);
          return;
        }
        const layers = params.side().layers;
        const hit = layers.filter((layer) => !layer.hidden && !layer.locked && intersects(layerBounds(layer), marquee)).map((layer) => layer.id);
        const ids = expandToGroups(layers, hit);
        params.setSelection([...before.filter((key) => layers.some((layer) => layer.id === key)), ...ids.filter((key) => !before.includes(key))]);
      });
    },
  };
}
