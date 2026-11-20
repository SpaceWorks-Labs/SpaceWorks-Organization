/** A question with an optional link to the detail on /features (the landing page keeps headlines only, §12.1). */
export type FaqItem = { q: string; a: string; more?: { href: string; label: string } };

/** The questions committees ask before they move their register here. Each answer is checked against docs/. */
export const FAQ: readonly FaqItem[] = [
  {
    q: "What does it cost?",
    a: "The software is free and open source under the AGPL. If you host it yourself, you pay only for your server. Payment providers charge their usual fees on online payments.",
  },
  {
    q: "Do members need to create an account?",
    a: "No. They join with their email address and a sign-in link. With member accounts on, they see their cards, receipts and renewals in one place; with them off, emails link to your public page or a signed pay link.",
  },
  {
    q: "Which payments work?",
    a: "Razorpay or Stripe online, one per organisation, plus UPI, bank transfer, cash and cheque recorded by your team. A member’s own “I’ve paid” counts only once a manager confirms it.",
  },
  {
    q: "Are the receipts right for GST?",
    a: "Receipts follow GST rules for place of supply and rounding, with numbers that never skip within a financial year. Registered or not, check your setup with your chartered accountant.",
  },
  {
    q: "We have branches or chapters. Does that fit?",
    a: "Yes. How branches, their staff and what each person can see work is on the features page.",
    more: { href: "/features#units", label: "Read about units and staff" },
  },
  {
    q: "Who decides whether our organisation can join this platform?",
    a: "The people who run this instance review every application before it opens, and email you their decision. If you host it yourself, that is you.",
  },
];
