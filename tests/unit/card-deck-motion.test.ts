import { describe, expect, it } from "vitest";
import { cardMotion, type CardMotionInput } from "@/components/marketing/cardMotion";

/** The landing page's drifting sample cards (components/marketing/CardDeck.tsx) give way to everything. */
const moving: CardMotionInput = { reducedMotion: false, userPaused: false, pointerInside: false, focusInside: false, offscreen: false, tabHidden: false };

describe("sample card drift", () => {
  it("moves only when nothing asks it to stop", () => {
    expect(cardMotion(moving)).toBe("moving");
  });

  it("pauses for the Pause button, a pointer, keyboard focus, off screen and a hidden tab", () => {
    for (const reason of ["userPaused", "pointerInside", "focusInside", "offscreen", "tabHidden"] as const) {
      expect(cardMotion({ ...moving, [reason]: true }), reason).toBe("paused");
    }
  });

  it("never moves under reduced motion, whatever else is true", () => {
    expect(cardMotion({ ...moving, reducedMotion: true })).toBe("still");
    expect(cardMotion({ ...moving, reducedMotion: true, userPaused: true, offscreen: true })).toBe("still");
  });
});
