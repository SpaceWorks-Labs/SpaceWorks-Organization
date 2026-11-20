/*
 * When a card design's history gains a version, and which versions it drops. Pure, shared by
 * lib/cards/versions.ts and its tests.
 */

export const CARD_VERSION_KINDS = ["DRAFT", "APPROVED"] as const;
export type CardVersionKind = (typeof CARD_VERSION_KINDS)[number];

/** Draft saves within this long of the newest draft version update it instead of adding another. */
export const DRAFT_VERSION_WINDOW_MS = 10 * 60_000;
/** Each design keeps at most this many versions; the oldest go first. */
export const CARD_VERSION_LIMIT = 30;

type VersionRow = { id: string; kind: string; createdAt: Date };

/**
 * What a new snapshot does: approvals always add a version; a draft save updates the newest version when
 * that is a draft started less than the window ago, else adds one.
 */
export function snapshotPlan(newest: VersionRow | null, kind: CardVersionKind, now: Date): { action: "create" } | { action: "update"; id: string } {
  if (kind === "DRAFT" && newest && newest.kind === "DRAFT" && now.getTime() - newest.createdAt.getTime() < DRAFT_VERSION_WINDOW_MS && now.getTime() >= newest.createdAt.getTime()) {
    return { action: "update", id: newest.id };
  }
  return { action: "create" };
}

/** The ids past the limit, given every version of one design (any order); the newest `limit` stay. */
export function versionsToPrune(rows: readonly VersionRow[], limit = CARD_VERSION_LIMIT): string[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    .slice(limit)
    .map((row) => row.id);
}

export function isCardVersionKind(value: unknown): value is CardVersionKind {
  return typeof value === "string" && (CARD_VERSION_KINDS as readonly string[]).includes(value);
}
