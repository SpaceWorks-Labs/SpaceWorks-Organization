"use client";

import { useState } from "react";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import { addLayer, createLayer, duplicateLayer, moveInOrder, removeLayer, updateLayer, type OrderMove } from "@/lib/cards/design/layerEdit";
import type { CardLayer, CardLayerKind } from "@/lib/cards/design/layers";

/** Within this distance, a dragged layer's centre snaps to the card's centre lines. */
const CENTRE_SNAP_MM = 1;

type WriteSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => void;

/** The designer's layer actions on the side being edited, with centre-line snapping while dragging. */
export function useLayerEditing({ side, writeSide, select }: { side: () => CardSideSettings; writeSide: WriteSide; select: (key: string | null) => void }) {
  const [guides, setGuides] = useState({ x: false, y: false });

  const change = (id: string, patch: Partial<CardLayer>, undoStep: boolean | "coalesce") => writeSide(updateLayer(side(), id, patch), undoStep);

  return {
    guides,
    change,
    add(kind: CardLayerKind, extra: { url?: string; aspect?: number } = {}) {
      const current = side();
      const layer = createLayer(current, kind, extra);
      if (!layer) return;
      writeSide(addLayer(current, layer), true);
      select(layer.id);
    },
    remove(id: string) {
      writeSide(removeLayer(side(), id), true);
      select(null);
    },
    duplicate(id: string) {
      const result = duplicateLayer(side(), id);
      if (!result.id) return;
      writeSide(result.side, true);
      select(result.id);
    },
    reorder(key: string, move: OrderMove) {
      writeSide(moveInOrder(side(), key, move), true);
    },
    /** A drag in progress: the undo step was taken when it started. */
    dragTo(id: string, xMm: number, yMm: number, snap: boolean) {
      const current = side();
      const layer = current.layers.find((item) => item.id === id);
      if (!layer) return;
      const grid = (value: number) => (snap ? Math.round(value / current.gridSizeMm) * current.gridSizeMm : Math.round(value * 10) / 10);
      let x = grid(xMm);
      let y = grid(yMm);
      const onX = snap && Math.abs(xMm + layer.wMm / 2 - current.widthMm / 2) < CENTRE_SNAP_MM;
      const onY = snap && Math.abs(yMm + layer.hMm / 2 - current.heightMm / 2) < CENTRE_SNAP_MM;
      if (onX) x = Math.round(((current.widthMm - layer.wMm) / 2) * 10) / 10;
      if (onY) y = Math.round(((current.heightMm - layer.hMm) / 2) * 10) / 10;
      if (guides.x !== onX || guides.y !== onY) setGuides({ x: onX, y: onY });
      if (x !== layer.xMm || y !== layer.yMm) change(id, { xMm: x, yMm: y }, false);
    },
    endDrag() {
      setGuides({ x: false, y: false });
    },
  };
}
