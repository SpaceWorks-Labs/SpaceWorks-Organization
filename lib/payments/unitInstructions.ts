/**
 * How a member pays offline: the nearest unit's own instructions (their unit, then each unit above it), then the
 * organisation's. Pure and client-safe; lib/payments/payGuidance.ts loads the chain.
 */

type InstructionUnit = { name: string; paymentInstructions: string };

export type PaymentGuidance = {
  /** The nearest non-empty instructions, or "" when nobody wrote any. */
  instructions: string;
  /** The unit whose instructions these are; null when they are the organisation's (or there are none). */
  fromUnit: string | null;
  /** The member's own unit, for "Pay your fee to your unit". */
  unitName: string | null;
  /** No usable gateway takes the fee's currency, so it is paid offline. */
  offlineOnly: boolean;
};

export const UNIT_INSTRUCTIONS_MAX = 1000;

/** The nearest non-empty instructions for a unit chain given top first (the member's own unit last). */
export function resolveUnitInstructions(chain: readonly InstructionUnit[], orgInstructions: string): { instructions: string; fromUnit: string | null } {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const text = chain[index].paymentInstructions.trim();
    if (text) return { instructions: text, fromUnit: chain[index].name };
  }
  return { instructions: orgInstructions.trim(), fromUnit: null };
}

/** Everything a pay page or email needs to tell a member how to pay offline. */
export function paymentGuidance(input: { chain: readonly InstructionUnit[]; orgInstructions: string; online: boolean }): PaymentGuidance {
  return {
    ...resolveUnitInstructions(input.chain, input.orgInstructions),
    unitName: input.chain.at(-1)?.name ?? null,
    offlineOnly: !input.online,
  };
}

/** "Pay your fee to your unit, North 1." when the organisation takes no online payments and the member has a unit. */
export function payToUnitLine(guidance: Pick<PaymentGuidance, "offlineOnly" | "unitName">): string | null {
  return guidance.offlineOnly && guidance.unitName ? `Pay your fee to your unit, ${guidance.unitName}.` : null;
}

/** The instructions as email paragraphs: one per non-empty line, at most twelve. */
export function instructionParagraphs(guidance: PaymentGuidance): string[] {
  const lines = guidance.instructions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
  const intro = payToUnitLine(guidance);
  return [...(intro ? [intro] : []), ...(lines.length ? ["How to pay:", ...lines] : [])];
}
