"use client";

import { useState } from "react";
import type { Rect } from "@/lib/cards/design/editor/bounds";
import { expandToGroups } from "@/lib/cards/design/editor/groups";
import { CARD_ELEMENTS, elementBoxHeightMm, type CardElement, type CardSideSettings } from "@/lib/cards/design/elements";
import { CanvasOverlay, type Overlays } from "./CanvasOverlay";
import { useCanvasTransform } from "./useCanvasTransform";
import { useEditorActions } from "./useEditorActions";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useGuides } from "./useGuides";
import { useZoom } from "./useZoom";

export const isElement = (key: string | null | undefined): key is CardElement => (CARD_ELEMENTS as readonly string[]).includes(key ?? "");
type WriteSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => void;

/**
 * The designer's editing state around one card side: the selection (a built-in item alone, or any
 * number of layers, always whole groups), zoom, guides, overlays, pointer transforms, the Arrange and
 * Position actions and the keyboard shortcuts.
 */
export function useCardEditor({ current, side, writeSide, visible, undo, redo, onError, both = false, initialSelection = ["name"] }: {
  current: CardSideSettings;
  /** Both sides shown side by side: zoom to fit two cards. */
  both?: boolean;
  /** What is selected at first; the card's name item unless given (a layers-only designer passes none). */
  initialSelection?: string[];
  side: () => CardSideSettings;
  writeSide: WriteSide;
  visible: Record<CardElement, boolean>;
  undo: () => void;
  redo: () => void;
  onError: (message: string | null) => void;
}) {
  const [rawSelection, setSelection] = useState<string[]>(initialSelection);
  const [overlays, setOverlays] = useState<Overlays>({ grid: false, bleed: false, safe: true, rulers: true });
  const [helpOpen, setHelpOpen] = useState(false);
  const zoom = useZoom(both ? current.widthMm * 2 + 12 : current.widthMm, current.heightMm);
  const guides = useGuides(current);
  // Undo, another side or a deletion can leave ids behind; only what exists counts.
  const selection = rawSelection.filter((key) => isElement(key) || current.layers.some((layer) => layer.id === key));
  const selectedLayers = current.layers.filter((layer) => selection.includes(layer.id));

  const select = (key: string, additive = false) => {
    if (isElement(key)) return setSelection([key]);
    const layers = side().layers;
    const group = expandToGroups(layers, [key]);
    if (!additive) return setSelection(group);
    const chosen = selection.filter((id) => !isElement(id));
    const all = group.every((id) => chosen.includes(id));
    setSelection(all ? chosen.filter((id) => !group.includes(id)) : [...chosen, ...group.filter((id) => !chosen.includes(id))]);
  };
  const actions = useEditorActions({ side, writeSide, selection, setSelection, onError });
  const itemRects: Rect[] = CARD_ELEMENTS.filter((element) => visible[element] && elementBoxHeightMm(element, current.elementSizes) > 0).map((element) => ({
    x: current.elementPositions[element].xMm,
    y: current.elementPositions[element].yMm,
    w: current.elementSizes[element],
    h: current.elementSizes[element],
  }));
  const transform = useCanvasTransform({
    side,
    pxPerMm: zoom.pxPerMm,
    selection,
    setSelection,
    writeLayers: (layers, undoStep) => writeSide({ ...side(), layers }, undoStep),
    guides: guides.guides,
    snapToGrid: overlays.grid,
    itemRects,
    toggle: (id) => select(id, true),
    paint: actions.painting ? actions.paintOnto : null,
  });
  const onKeyDown = useEditorShortcuts({
    actions,
    hasLayerSelection: selectedLayers.length > 0,
    hasSelection: selection.length > 0,
    clearSelection: () => setSelection([]),
    undo,
    redo,
    zoom: { in: zoom.zoomIn, out: zoom.zoomOut, fit: zoom.fit },
    openHelp: () => setHelpOpen(true),
  });

  const overlay = (
    <CanvasOverlay
      pxPerMm={zoom.pxPerMm}
      card={current}
      selected={selectedLayers}
      live={transform.live}
      overlays={overlays}
      guides={guides}
      onGuideDown={(axis, index, event) => {
        const frame = event.currentTarget.closest("[data-card-frame]");
        if (frame) guides.startDrag(axis, index, event, frame, zoom.pxPerMm);
      }}
      onHandleDown={(mode, event) => transform.begin(mode, event, selectedLayers.map((layer) => layer.id))}
    />
  );

  return { selection, selectedLayers, setSelection, select, overlays, setOverlays, helpOpen, setHelpOpen, zoom, guides, actions, transform, onKeyDown, overlay };
}
