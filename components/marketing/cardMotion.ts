/*
 * When the landing page's sample cards drift (CardDeck). The drift is the one loop outside a loader (owner
 * decision 2026-11-19, docs/DESIGN.md "Landing page"), so it gives way to everything: reduced motion keeps the
 * cards still, and the Pause button, a pointer or keyboard focus on the cards, the section being off screen or the
 * tab being hidden each pause it. Pure, so the rules are unit-tested.
 */

export type CardMotionInput = {
  reducedMotion: boolean;
  /** The visitor pressed Pause (WCAG 2.2.2). */
  userPaused: boolean;
  pointerInside: boolean;
  focusInside: boolean;
  offscreen: boolean;
  tabHidden: boolean;
};

/** "still": never moves (reduced motion); "paused": holds where it is; "moving": drifts. */
export type CardMotion = "still" | "paused" | "moving";

export function cardMotion(input: CardMotionInput): CardMotion {
  if (input.reducedMotion) return "still";
  if (input.userPaused || input.pointerInside || input.focusInside || input.offscreen || input.tabHidden) return "paused";
  return "moving";
}

/** One full drift, in seconds: slow enough to read a card as it passes. */
export const CARD_DRIFT_SECONDS = 54;
