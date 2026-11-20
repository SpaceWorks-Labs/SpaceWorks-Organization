"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { CardElement, CardSideSettings } from "@/lib/cards/design/elements";

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
  /** Selected built-in item or layer ids (a built-in item is only ever selected alone). */
  selection: readonly string[];
  /** Select a built-in item or layer; `additive` (Shift) adds it to, or takes it from, the selection. */
  onSelect: (key: string, additive?: boolean) => void;
  /** Called once when a built-in item's drag or nudge starts, so it becomes one undo step. */
  onBeginChange: () => void;
  onMove: (element: CardElement, xMm: number, yMm: number) => void;
  /** Pointer down on a layer: select it (Shift adds) and start moving the selection. */
  onLayerPointerDown: (id: string, event: PointerEvent<HTMLElement>) => void;
  showGrid: boolean;
  /** Drawn over the card, outside its clipping: selection frames, guides and overlays. */
  overlay?: ReactNode;
};

/**
 * Selection, dragging and arrow-key nudging for the items on an editable card. Without an
 * interaction the card is a static preview and items get no props.
 */
export function useCanvasItems(settings: CardSideSettings, pxPerMm: number, interaction?: CanvasInteraction) {
  const [drag, setDrag] = useState<{ element: CardElement; startX: number; startY: number; origin: { xMm: number; yMm: number } } | null>(null);
  return (element: CardElement) => {
    if (!interaction) return {};
    const selected = interaction.selection.includes(element);
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
