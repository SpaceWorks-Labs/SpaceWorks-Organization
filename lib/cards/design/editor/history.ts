/*
 * Undo and redo as a pure value. `checkpoint` stores the state as it was before a change; edits
 * closer together than COALESCE_MS that ask to coalesce (typing, a slider) undo as one step.
 */

export const HISTORY_LIMIT = 60;
export const COALESCE_MS = 700;

export type History<T> = { past: T[]; future: T[]; last: number };

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], last: 0 };
}

export function checkpoint<T>(history: History<T>, current: T, coalesce: boolean, now: number): History<T> {
  if (coalesce && now - history.last < COALESCE_MS) return { ...history, last: now };
  return { past: [...history.past.slice(-(HISTORY_LIMIT - 1)), current], future: [], last: now };
}

/** The state to go back to and the history after it; null when there is nothing to undo. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const previous = history.past.at(-1);
  if (previous === undefined) return null;
  return { state: previous, history: { past: history.past.slice(0, -1), future: [current, ...history.future], last: 0 } };
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const next = history.future[0];
  if (next === undefined) return null;
  return { state: next, history: { past: [...history.past, current], future: history.future.slice(1), last: 0 } };
}
