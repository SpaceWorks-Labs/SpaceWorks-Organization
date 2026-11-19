/**
 * The landing page's story: one sample membership from the join link to the renewal. Every name is invented and
 * every step is labelled as a sample; each line is checked against docs/features/*.md.
 */
export const SAMPLE = {
  member: "Asha Menon",
  organisation: "Riverside Cycling Club",
  plan: "Annual membership 2026–27",
  cardNumber: "RCC-0142",
  receipt: "RCC/26-27/0142",
};

export type StoryTone = "warning" | "info" | "success";

export type StoryStep = {
  key: string;
  /** The state the record shows once this step is reached. */
  state: string;
  title: string;
  body: string;
  /** In the record: who did it, the proof written down, and the status chip. */
  who: string;
  proof: string;
  status: { label: string; tone: StoryTone };
};

export const STORY: readonly StoryStep[] = [
  {
    key: "join", state: "Joined",
    title: "Asha joins from the club's link",
    body: "She picks a plan on the club's public page. The plan's form asks only what the committee chose: built-in fields, its own questions and a photo.",
    who: "Asha, from the join link", proof: "Join form, photo and consent", status: { label: "Waiting for approval", tone: "warning" },
  },
  {
    key: "approve", state: "Approved",
    title: "A manager approves her in the queue",
    body: "Applications to plans that need vetting wait in one queue with every answer. Plans without approval take people straight in.",
    who: "Membership manager, in the queue", proof: "Decision recorded with who and when", status: { label: "Waiting for payment", tone: "info" },
  },
  {
    key: "pay", state: "Paid",
    title: "She pays online, or at the desk",
    body: "Razorpay or Stripe online, or UPI, bank transfer, cash and cheque recorded by staff. Her own “I’ve paid” counts only once a manager confirms it. The GST receipt never skips a number.",
    who: "Treasurer, from the collection sheet", proof: `UPI confirmed · receipt ${SAMPLE.receipt}`, status: { label: "Active", tone: "success" },
  },
  {
    key: "card", state: "Card issued",
    title: "Her card is issued the same day",
    body: "Drawn from the approved design as matching PDF and PNG, with a QR anyone can scan to see whether it is valid. Her phone number and address never show.",
    who: "Issued when the membership began", proof: `Card ${SAMPLE.cardNumber} · valid to 31 Mar 2027`, status: { label: "Active", tone: "success" },
  },
  {
    key: "renew", state: "Renewed",
    title: "She renews before it runs out",
    body: "Reminders go out as the end date comes near. She renews from her account, or from a signed pay link when member accounts are off, and keeps the same card and number.",
    who: "Asha, from her account", proof: "Same card · 1 Apr 2027 to 31 Mar 2028", status: { label: "Renewed for 2027–28", tone: "success" },
  },
];
