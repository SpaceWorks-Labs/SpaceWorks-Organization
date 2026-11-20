/**
 * The landing page's story: one sample membership from the join link to the renewal. Names are the SpaceWorks team's and
 * every step is labelled as a sample; each line is checked against docs/features/*.md.
 */
export const SAMPLE = {
  member: "Abhiram NJ",
  organisation: "Kunj-Company",
  plan: "Annual membership 2026–27",
  cardNumber: "KC-0142",
  receipt: "KC/26-27/0142",
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
    title: "Abhiram joins from the club's link",
    body: "He picks a plan on the club's public page. The plan's form asks only what the committee chose: built-in fields, its own questions and a photo.",
    who: "Abhiram, from the join link", proof: "Join form, photo and consent", status: { label: "Waiting for approval", tone: "warning" },
  },
  {
    key: "approve", state: "Approved",
    title: "A manager approves him in the queue",
    body: "Applications to plans that need vetting wait in one queue with every answer. Plans without approval take people straight in.",
    who: "Membership manager, in the queue", proof: "Decision recorded with who and when", status: { label: "Waiting for payment", tone: "info" },
  },
  {
    key: "pay", state: "Paid",
    title: "He pays online, or at the desk",
    body: "Razorpay or Stripe online, or UPI, bank transfer, cash and cheque recorded by staff. His own “I’ve paid” counts only once a manager confirms it. The GST receipt never skips a number.",
    who: "Treasurer, from the collection sheet", proof: `UPI confirmed · receipt ${SAMPLE.receipt}`, status: { label: "Active", tone: "success" },
  },
  {
    key: "card", state: "Card issued",
    title: "His card is issued the same day",
    body: "Drawn from the approved design as matching PDF and PNG, with a QR anyone can scan to see whether it is valid. His phone number and address never show.",
    who: "Issued when the membership began", proof: `Card ${SAMPLE.cardNumber} · valid to 31 Mar 2027`, status: { label: "Active", tone: "success" },
  },
  {
    key: "renew", state: "Renewed",
    title: "He renews before it runs out",
    body: "Reminders go out as the end date comes near. He renews from his account, or from a signed pay link when member accounts are off, and keeps the same card and number.",
    who: "Abhiram, from his account", proof: "Same card · 1 Apr 2027 to 31 Mar 2028", status: { label: "Renewed for 2027–28", tone: "success" },
  },
];
