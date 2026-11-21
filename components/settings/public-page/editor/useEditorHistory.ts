"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkpoint, emptyHistory, redo as redoHistory, undo as undoHistory, type History } from "@/lib/cards/design/editor/history";
import type { PageDocument } from "@/lib/publicPage/sections";

/**
 * The document being edited with undo and redo for this visit (the card editor's pure history). Typing in one field
 * coalesces into one step; every other change is its own. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y work anywhere except
 * inside a text field, where the browser's own undo applies.
 */
export function useEditorHistory(initial: PageDocument) {
  const [state, setState] = useState<{ document: PageDocument; history: History<PageDocument> }>(() => ({ document: initial, history: emptyHistory() }));
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const change = useCallback((next: PageDocument | ((current: PageDocument) => PageDocument), coalesce = false) => {
    setState((current) => {
      const document = typeof next === "function" ? next(current.document) : next;
      if (document === current.document) return current;
      return { document, history: checkpoint(current.history, current.document, coalesce, Date.now()) };
    });
  }, []);

  const undo = useCallback(() => setState((current) => {
    const result = undoHistory(current.history, current.document);
    return result ? { document: result.state, history: result.history } : current;
  }), []);

  const redo = useCallback(() => setState((current) => {
    const result = redoHistory(current.history, current.document);
    return result ? { document: result.state, history: result.history } : current;
  }), []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [undo, redo]);

  return {
    document: state.document,
    change,
    undo,
    redo,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    /** The document right now, for callbacks that run after an await. */
    current: () => latest.current.document,
  };
}
