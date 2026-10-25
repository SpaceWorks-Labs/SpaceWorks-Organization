"use client";

import { useRef, useState } from "react";
import type { CardDesign } from "@/lib/cards/design/presets";

const LIMIT = 60;
/** Edits closer together than this (typing, a slider) undo as one step. */
const COALESCE_MS = 700;

/**
 * Undo and redo for the card designer. Call `checkpoint` with the design as it is before a change:
 * a drag checkpoints once when it starts; quick runs of edits coalesce into one step.
 */
export function useDesignHistory() {
  const past = useRef<CardDesign[]>([]);
  const future = useRef<CardDesign[]>([]);
  const last = useRef(0);
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const bump = () => setCounts({ past: past.current.length, future: future.current.length });

  return {
    checkpoint(current: CardDesign, coalesce: boolean) {
      const now = Date.now();
      if (coalesce && now - last.current < COALESCE_MS) {
        last.current = now;
        return;
      }
      last.current = now;
      past.current = [...past.current.slice(-(LIMIT - 1)), current];
      future.current = [];
      bump();
    },
    undo(current: CardDesign) {
      const previous = past.current.at(-1);
      if (!previous) return null;
      past.current = past.current.slice(0, -1);
      future.current = [current, ...future.current];
      last.current = 0;
      bump();
      return previous;
    },
    redo(current: CardDesign) {
      const next = future.current[0];
      if (!next) return null;
      future.current = future.current.slice(1);
      past.current = [...past.current, current];
      last.current = 0;
      bump();
      return next;
    },
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
  };
}
