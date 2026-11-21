import { describe, expect, it } from "vitest";
import { reword } from "@/components/cards/designer/wording";
import { SHORTCUTS } from "@/components/cards/designer/editor/shortcuts";

describe("designer wording", () => {
  it("leaves the card wording untouched", () => {
    expect(reword("Fit the card (Ctrl+0)", "card")).toBe("Fit the card (Ctrl+0)");
  });

  it("names the certificate where the shared editor says the card", () => {
    expect(reword("Fit the card (Ctrl+0)", "certificate")).toBe("Fit the certificate (Ctrl+0)");
    expect(reword("Align to the card", "certificate")).toBe("Align to the certificate");
    expect(SHORTCUTS.map((shortcut) => reword(shortcut.label, "certificate")).join(" ")).not.toMatch(/\bcard\b/i);
  });
});
