import { describe, expect, it } from "vitest";
import { instructionParagraphs, paymentGuidance, payToUnitLine, resolveUnitInstructions } from "@/lib/payments/unitInstructions";

const area = { name: "North", paymentInstructions: "Pay the North treasurer at the monthly meeting." };
const unit = { name: "North 1", paymentInstructions: "" };

describe("resolveUnitInstructions", () => {
  it("uses the member's own unit first", () => {
    expect(resolveUnitInstructions([area, { ...unit, paymentInstructions: "UPI north1@bank" }], "Bank transfer to Example Network")).toEqual({ instructions: "UPI north1@bank", fromUnit: "North 1" });
  });

  it("falls back to the nearest unit above, skipping blank ones", () => {
    expect(resolveUnitInstructions([area, { ...unit, paymentInstructions: "   " }], "Bank transfer")).toEqual({ instructions: area.paymentInstructions, fromUnit: "North" });
  });

  it("falls back to the organisation, then to nothing", () => {
    expect(resolveUnitInstructions([{ ...area, paymentInstructions: "" }, unit], " Bank transfer ")).toEqual({ instructions: "Bank transfer", fromUnit: null });
    expect(resolveUnitInstructions([], "")).toEqual({ instructions: "", fromUnit: null });
  });
});

describe("paymentGuidance", () => {
  it("is offline only without a gateway, and names the member's unit", () => {
    const none = paymentGuidance({ chain: [area, unit], orgInstructions: "", online: false });
    expect(none).toMatchObject({ offlineOnly: true, unitName: "North 1", fromUnit: "North" });
    expect(payToUnitLine(none)).toBe("Pay your fee to your unit, North 1.");
  });

  it("keeps the usual wording with a gateway or without a unit", () => {
    const online = paymentGuidance({ chain: [area, unit], orgInstructions: "", online: true });
    expect(online.offlineOnly).toBe(false);
    expect(payToUnitLine(online)).toBeNull();
    expect(payToUnitLine(paymentGuidance({ chain: [], orgInstructions: "Cash at the office", online: false }))).toBeNull();
  });

  it("turns instructions into email paragraphs, one per line", () => {
    const guidance = paymentGuidance({ chain: [{ name: "North 1", paymentInstructions: "Cash to the secretary\n\nUPI north1@bank" }], orgInstructions: "", online: false });
    expect(instructionParagraphs(guidance)).toEqual(["Pay your fee to your unit, North 1.", "How to pay:", "Cash to the secretary", "UPI north1@bank"]);
    expect(instructionParagraphs(paymentGuidance({ chain: [], orgInstructions: "", online: true }))).toEqual([]);
  });
});
