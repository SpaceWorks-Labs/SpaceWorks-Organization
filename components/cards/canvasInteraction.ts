"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CardElement, CardSideSettings } from "@/lib/cards/design/elements";
import type { CardLayer } from "@/lib/cards/design/layers";

export const SAFE_MARGIN_MM = 3;

export const ELEMENT_LABELS: Record<CardElement, string> = {
  header: "Heading",
  name: "Member name",
  role: "Role",
  plan: "Plan",
  details: "Answers",
  qr: "Check QR code",
  footer: "Footer or note",
  logo: "Organisation logo",
  symbol: "Space Works symbol",
  photo: "Photo",
  idNumber: "Card number",
  validUntil: "Valid until",
};

export type CanvasInteraction = {
  /** A built-in item or a layer id. */
  selected: string | null;
  onSelect: (key: string) => void;
  /** Called once when a drag or nudge starts, so it becomes one undo step. */
  onBeginChange: () => void;
  onMove: (element: CardElement, xMm: number, yMm: number) => void;
  /** A layer dragged to (xMm, yMm); `snap` to the grid and the card's centre lines. */
  onLayerMove: (id: string, xMm: number, yMm: number, snap: boolean) => void;
  onLayerMoveEnd: () => void;
  onLayerChange: (id: string, patch: Partial<CardLayer>) => void;
  /** Centre lines a dragged layer has snapped to. */
  guides: { x: boolean; y: boolean };
  showGrid: boolean;
};

/**
 * Selection, dragging and arrow-key nudging for the items on an editable card. Without an
 * interaction the card is a static preview and items get no props.
 */
export function useCanvasItems(settings: CardSideSettings, pxPerMm: number, interaction?: CanvasInteraction) {
  const [drag, setDrag] = useState<{ element: CardElement; startX: number; startY: number; origin: { xMm: number; yMm: number } } | null>(null);
  return (element: CardElement) => {
    if (!interaction) return {};
    const selected = interaction.selected === element;
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `${ELEMENT_LABELS[element]}. Arrow keys move it; hold Shift for bigger steps.`,
      "aria-pressed": selected,
      "data-selected": selected ? "" : undefined,
      className: "outline-offset-2 hover:outline hover:outline-1 hover:outline-primary focus-visible:outline-2 data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-primary",
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        interaction.onSelect(element);
        interaction.onBeginChange();
        setDrag({ element, startX: event.clientX, startY: event.clientY, origin: settings.elementPositions[element] });
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!drag || drag.element !== element) return;
        interaction.onMove(element, drag.origin.xMm + (event.clientX - drag.startX) / pxPerMm, drag.origin.yMm + (event.clientY - drag.startY) / pxPerMm);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(null);
      },
      onPointerCancel: () => setDrag(null),
      onFocus: () => interaction.onSelect(element),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? settings.gridSizeMm * 5 : settings.gridSizeMm;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        interaction.onBeginChange();
        const at = settings.elementPositions[element];
        interaction.onMove(element, at.xMm + move[0], at.yMm + move[1]);
      },
    };
  };
}
