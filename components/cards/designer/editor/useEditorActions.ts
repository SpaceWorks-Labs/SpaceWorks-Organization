"use client";

import { useState } from "react";
import { alignLayers, distributeLayers, type AlignEdge } from "@/lib/cards/design/editor/align";
import { copyLayers, deleteLayers, duplicateLayers, flipLayers, pasteLayers, type LayerClipboard } from "@/lib/cards/design/editor/clipboard";
import { groupLayers, moveLayers, ungroupLayers } from "@/lib/cards/design/editor/groups";
import { moveManyInOrder } from "@/lib/cards/design/editor/order";
import { centreOnCard, editSelectionBox, fillCard, type BoxField } from "@/lib/cards/design/editor/position";
import { applyStyleTo, copyStyle, type CopiedStyle } from "@/lib/cards/design/editor/style";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import { createLayer, type OrderMove } from "@/lib/cards/design/layerEdit";
import { LAYER_TEXT_MAX, MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";

type WriteSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => void;
const FULL = `A side holds up to ${MAX_LAYERS} layers. Delete some to add these.`;

/**
 * Everything the Arrange and Position panels and the keyboard do to the selection. Each action writes
 * the side once, so a change to many layers undoes as one step; nudges and typed sizes coalesce.
 */
export function useEditorActions({ side, writeSide, selection, setSelection, onError }: {
  side: () => CardSideSettings;
  writeSide: WriteSide;
  selection: readonly string[];
  setSelection: (ids: string[]) => void;
  onError: (message: string | null) => void;
}) {
  const [clipboard, setClipboard] = useState<LayerClipboard | null>(null);
  const [style, setStyle] = useState<CopiedStyle | null>(null);
  const [painting, setPainting] = useState(false);

  const ids = () => selection.filter((id) => side().layers.some((layer) => layer.id === id));
  const layers = (next: CardLayer[], undoStep: boolean | "coalesce" = true) => writeSide({ ...side(), layers: next }, undoStep);
  const each = (patch: (layer: CardLayer) => Partial<CardLayer>) => {
    const picked = new Set(ids());
    layers(side().layers.map((layer) => (picked.has(layer.id) ? ({ ...layer, ...patch(layer) } as CardLayer) : layer)));
  };
  const paste = (from: LayerClipboard, keep = true) => {
    const result = pasteLayers(side(), from);
    if (!result) {
      onError(FULL);
      return null;
    }
    writeSide(result.side, true);
    setSelection(result.ids);
    if (keep) setClipboard(result.clipboard);
    return result;
  };

  return {
    clipboard,
    style,
    painting,
    align: (edge: AlignEdge) => layers(alignLayers(side().layers, ids(), edge, side())),
    distribute: (axis: "x" | "y") => layers(distributeLayers(side().layers, ids(), axis)),
    group: () => layers(groupLayers(side().layers, ids())),
    ungroup: () => layers(ungroupLayers(side().layers, ids())),
    order: (move: OrderMove) => writeSide({ ...side(), order: moveManyInOrder(side().order, selection, move) }, true),
    flip: (axis: "x" | "y") => layers(flipLayers(side().layers, ids(), axis)),
    nudge: (dx: number, dy: number) => layers(moveLayers(side().layers, ids(), dx, dy), "coalesce"),
    editBox: (field: BoxField, value: number, lockRatio: boolean) => layers(editSelectionBox(side().layers, ids(), field, value, lockRatio), "coalesce"),
    centre: (axis: "x" | "y") => layers(centreOnCard(side().layers, ids(), axis, side())),
    fill: () => layers(fillCard(side().layers, ids(), side())),
    toggleLock() {
      const lock = !side().layers.filter((layer) => ids().includes(layer.id)).every((layer) => layer.locked);
      each(() => ({ locked: lock }));
    },
    toggleHidden() {
      const hide = !side().layers.filter((layer) => ids().includes(layer.id)).every((layer) => layer.hidden);
      each(() => ({ hidden: hide }));
    },
    duplicate() {
      const result = duplicateLayers(side(), ids());
      if (!result) return void (ids().length && onError(FULL));
      writeSide(result.side, true);
      setSelection(result.ids);
    },
    copy: () => setClipboard(copyLayers(side(), ids())),
    cut() {
      const copied = copyLayers(side(), ids());
      if (!copied) return;
      setClipboard(copied);
      writeSide(deleteLayers(side(), ids()), true);
      setSelection([]);
    },
    paste: () => void (clipboard && paste(clipboard)),
    remove() {
      if (!ids().length) return;
      writeSide(deleteLayers(side(), ids()), true);
      setSelection([]);
    },
    selectAll: () => setSelection(side().layers.filter((layer) => !layer.hidden && !layer.locked).map((layer) => layer.id)),
    /** Copy the one selected layer's style and start painting it onto layers pressed next. */
    copyStyle() {
      const source = side().layers.find((layer) => layer.id === ids()[0]);
      if (!source || ids().length !== 1) return;
      setStyle(copyStyle(source));
      setPainting(true);
    },
    applyStyle: () => void (style && layers(applyStyleTo(side().layers, ids(), style))),
    paintOnto(id: string) {
      if (!style) return;
      const group = side().layers.find((layer) => layer.id === id)?.groupId;
      const targets = side().layers.filter((layer) => layer.id === id || (group && layer.groupId === group)).map((layer) => layer.id);
      layers(applyStyleTo(side().layers, targets, style));
      setSelection(targets);
      setPainting(false);
    },
    stopPainting: () => setPainting(false),
    /** New layers from the Elements panel, on top as one step; several are grouped. */
    insert(added: CardLayer[]) {
      const result = paste({ layers: added, pastes: 0 }, false);
      if (!result || result.ids.length < 2 || result.side.layers.some((layer) => result.ids.includes(layer.id) && layer.groupId)) return;
      writeSide({ ...result.side, layers: groupLayers(result.side.layers, result.ids) }, "coalesce");
    },
    /** A placeholder into the selected text layer, or a new text layer holding it. */
    insertText(placeholder: string) {
      const token = `{${placeholder}}`;
      const target = side().layers.find((layer) => layer.kind === "text" && ids().length === 1 && layer.id === ids()[0]);
      if (target?.kind === "text") return layers(side().layers.map((layer) => (layer.id === target.id ? { ...target, text: `${target.text}${token}`.slice(0, LAYER_TEXT_MAX) } : layer)));
      const created = createLayer(side(), "text");
      if (!created || created.kind !== "text") return onError(FULL);
      paste({ layers: [{ ...created, text: token }], pastes: 0 }, false);
    },
  };
}

export type EditorActions = ReturnType<typeof useEditorActions>;
