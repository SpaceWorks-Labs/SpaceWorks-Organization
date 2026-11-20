"use client";

import { useRef, useState } from "react";
import { checkpoint, emptyHistory, redo, undo, type History } from "@/lib/cards/design/editor/history";
import type { CardDesign } from "@/lib/cards/design/presets";

/**
 * Undo and redo for the card designer (lib/cards/design/editor/history.ts). Call `checkpoint` with the
 * design as it is before a change: a drag checkpoints once when it starts, a change to several layers
 * once for all of them, and quick runs of edits coalesce into one step.
 */
export function useDesignHistory() {
  const history = useRef<History<CardDesign>>(emptyHistory());
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const set = (next: History<CardDesign>) => {
    history.current = next;
    setCounts({ past: next.past.length, future: next.future.length });
  };
  const step = (result: { history: History<CardDesign>; state: CardDesign } | null) => {
    if (!result) return null;
    set(result.history);
    return result.state;
  };

  return {
    checkpoint(current: CardDesign, coalesce: boolean) {
      set(checkpoint(history.current, current, coalesce, Date.now()));
    },
    undo: (current: CardDesign) => step(undo(history.current, current)),
    redo: (current: CardDesign) => step(redo(history.current, current)),
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
  };
}
