"use client";

import type { CardSideSettings } from "@/lib/cards/design/elements";
import { addLayer, createLayer, updateLayer } from "@/lib/cards/design/layerEdit";
import type { CardLayer, CardLayerKind } from "@/lib/cards/design/layerTypes";

type WriteSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => void;

/**
 * Adding a layer and changing one layer on the side being edited. Edits to the selection (move,
 * align, group, copy and paste, delete) live in ./editor/useEditorActions.ts.
 */
export function useLayerEditing({ side, writeSide, select }: { side: () => CardSideSettings; writeSide: WriteSide; select: (ids: string[]) => void }) {
  return {
    change: (id: string, patch: Partial<CardLayer>, undoStep: boolean | "coalesce") => writeSide(updateLayer(side(), id, patch), undoStep),
    add(kind: CardLayerKind, extra: { url?: string; aspect?: number } = {}) {
      const current = side();
      const layer = createLayer(current, kind, extra);
      if (!layer) return;
      writeSide(addLayer(current, layer), true);
      select([layer.id]);
    },
  };
}
