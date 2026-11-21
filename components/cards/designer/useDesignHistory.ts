"use client";

import { useRef, useState } from "react";
import { checkpoint, emptyHistory, redo, undo, type History } from "@/lib/cards/design/editor/history";
import type { CardDesign } from "@/lib/cards/design/presets";

/**
 * Undo and redo for the card designer (lib/cards/design/editor/history.ts). Call `checkpoint` with the
 * design as it is before a change: a drag checkpoints once when it starts, a change to several layers
 * once for all of them, and quick runs of edits coalesce into one step. `T` is what is undone: the card
 * design by default, or one side for a single-sided designer (certificates).
 */
export function useDesignHistory<T = CardDesign>() {
  const history = useRef<History<T>>(emptyHistory());
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const set = (next: History<T>) => {
    history.current = next;
    setCounts({ past: next.past.length, future: next.future.length });
  };
  const step = (result: { history: History<T>; state: T } | null) => {
    if (!result) return null;
    set(result.history);
    return result.state;
  };

  return {
    checkpoint(current: T, coalesce: boolean) {
      set(checkpoint(history.current, current, coalesce, Date.now()));
    },
    undo: (current: T) => step(undo(history.current, current)),
    redo: (current: T) => step(redo(history.current, current)),
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
  };
}
