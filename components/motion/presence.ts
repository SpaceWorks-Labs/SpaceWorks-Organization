/**
 * The presence state machine behind usePresence and useExitingItems (pure, unit-tested). A layer is `open`,
 * `closing` (still mounted, inert, playing its exit) or `closed` (unmounted). Without animation (server, tests,
 * reduced motion) hiding goes straight to `closed`, so nothing waits for an exit that never plays.
 */
export type PresencePhase = "open" | "closing" | "closed";
export type PresenceEvent = { type: "show" } | { type: "hide"; animated: boolean } | { type: "exited" };

export function presenceReducer(phase: PresencePhase, event: PresenceEvent): PresencePhase {
  switch (event.type) {
    case "show":
      return "open";
    case "hide":
      if (phase === "closed") return "closed";
      return event.animated ? "closing" : "closed";
    case "exited":
      return phase === "closing" ? "closed" : phase;
  }
}

export type ExitingItem<T> = { item: T; leaving: boolean };

/**
 * Merges the live list into what is on screen: rows still live keep their place (updated), rows that vanished stay
 * flagged `leaving` until their exit ends, new rows join at the end. Rows already gone from `previous` are not revived.
 */
export function mergeExiting<T>(previous: readonly ExitingItem<T>[], items: readonly T[], keyOf: (item: T) => string | number): ExitingItem<T>[] {
  const live = new Map(items.map((item) => [keyOf(item), item] as const));
  const seen = new Set<string | number>();
  const merged: ExitingItem<T>[] = [];
  for (const row of previous) {
    const key = keyOf(row.item);
    const current = live.get(key);
    if (current !== undefined) {
      merged.push({ item: current, leaving: false });
      seen.add(key);
    } else {
      merged.push({ item: row.item, leaving: true });
    }
  }
  for (const item of items) if (!seen.has(keyOf(item))) merged.push({ item, leaving: false });
  return merged;
}

/** Drops one leaving row once its exit has finished. */
export function dropExited<T>(rows: readonly ExitingItem<T>[], key: string | number, keyOf: (item: T) => string | number): ExitingItem<T>[] {
  return rows.filter((row) => !row.leaving || keyOf(row.item) !== key);
}
