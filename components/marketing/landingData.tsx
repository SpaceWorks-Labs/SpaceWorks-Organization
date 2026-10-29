import { SAMPLE } from "./sample";
import { Proof } from "./Proof";

/** Sample content for the landing page: the SpaceWorks team's year, receipt, units and questions. */
export const GITHUB = "https://github.com/SpaceWorks-Labs/SpaceWorks-Organization";
export const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

/** One sample membership year, April to March, in the order it happens. */
export const YEAR: Array<{ when: string; title: string; body: string; proof: React.ReactNode }> = [
  {
    when: "1 Apr",
    title: "Shaan applies to join",
    body: "The SpaceWorks join form asks for the plan, the chapter, a photo and consent. An email link signs them in, so there is no account to set up first.",
    proof: <Proof tone="panel">Annual membership · Kochi chapter · photo added</Proof>,
  },
  {
    when: "2 Apr",
    title: "Abhiram approves",
    body: "Applications wait in one queue with everything the form asked. Plans that need no vetting take members straight in.",
    proof: <Proof tone="citron">Approved by Abhiram NJ, manager</Proof>,
  },
  {
    when: "2 Apr",
    title: "Pays ₹1,200 by UPI",
    body: "Online through Razorpay or Stripe, or UPI and cash recorded by hand. Offline money counts only after a second treasurer, here Abdul Samad, confirms it.",
    proof: <Proof tone="panel"><span className="tabular-nums">₹1,200.00 · UPI · UTR 6128 4093 7712</span></Proof>,
  },
  {
    when: "2 Apr",
    title: `Receipt ${SAMPLE.receipt}`,
    body: "A GST tax invoice, numbered without gaps for the financial year and emailed with the card.",
    proof: <Proof tone="yellow"><span className="tabular-nums">{SAMPLE.receipt}</span> · next is 0002, never 0003</Proof>,
  },
  {
    when: "2 Apr",
    title: "The card is issued",
    body: "On the day the membership starts. Shaan downloads it, keeps it on their phone or has it printed.",
    proof: <Proof tone="teal"><span className="tabular-nums">{SAMPLE.cardNumber}</span> · valid until {SAMPLE.validUntil}</Proof>,
  },
  {
    when: "Jun–Feb",
    title: "Shows the card at the door",
    body: "Whoever checks it scans the QR and sees the live status. Phone numbers and addresses never appear.",
    proof: <Proof tone="citron">Valid · {SAMPLE.organisation} · {SAMPLE.plan}</Proof>,
  },
  {
    when: "1 Mar",
    title: "Reminded to renew",
    body: "Thirty days before, a week before, on the day and once after it ends. Each reminder goes out once, never twice.",
    proof: <Proof tone="sky">Your membership ends on 31 March</Proof>,
  },
  {
    when: "18 Mar",
    title: "Renews for 2027–28",
    body: "Paid early, so the new year waits to begin on 1 April. Same card, same QR. Had it lapsed, grace days and the churn report would have caught it.",
    proof: <Proof tone="panel">Upcoming · 1 Apr 2027 to 31 Mar 2028</Proof>,
  },
];

export const RECEIPT_LINES = [
  { label: "Annual membership 2026–27", value: "1,016.95" },
  { label: "CGST 9%", value: "91.53" },
  { label: "SGST 9%", value: "91.52" },
];

export const UNITS = [
  { name: "Kerala", depth: 0, members: 214 },
  { name: "Kochi chapter", depth: 1, members: 128 },
  { name: "Kozhikode chapter", depth: 1, members: 86 },
  { name: "Karnataka", depth: 0, members: 54 },
  { name: "Bengaluru chapter", depth: 1, members: 54 },
];

/** The SpaceWorks team as the sample committee: their organisation role, and the access it gives them. */
export const TEAM = [
  { name: "Shaan Shoukath", role: "Systems Engineer", access: "Owner" },
  { name: "Abhiram NJ", role: "Cloud Specialist", access: "Manager" },
  { name: "Abdul Samad MJ", role: "Full Stack Developer", access: "Treasurer" },
  { name: "Midlaj C", role: "Backend Engineer", access: "Manager" },
  { name: "Ajzal P", role: "Marketing Specialist", access: "Viewer" },
  { name: "Anin Arafath", role: "App Developer", access: "Viewer" },
] as const;

/** Sample active members per month for the report preview. */
export const ACTIVE = [180, 204, 221, 229, 236, 240, 247, 251, 258, 263, 266, 268];

export const FAQ = [
  {
    q: "What does it cost?",
    a: "The software is free and open source under the AGPL. If you host it yourself, you pay only for your server. Payment providers charge their usual fees on online payments.",
  },
  {
    q: "Do members need to create an account?",
    a: "No. They join with their email address and a sign-in link. They can add a password later to see their cards, receipts and renewals in one place.",
  },
  {
    q: "Which payments work?",
    a: "Razorpay and Stripe online, plus UPI, bank transfer and cash recorded by your treasurer. Each organisation picks the one online provider it uses.",
  },
  {
    q: "Are the receipts right for GST?",
    a: "Receipts follow GST rules for place of supply and rounding, with gapless numbers per financial year. Registered or not, check your setup with your chartered accountant.",
  },
  {
    q: "We already have a member list. Can we bring it?",
    a: "Yes. Import a spreadsheet, match its columns to your fields, and start renewals from where each member is.",
  },
  {
    q: "Who decides whether our organisation can join this platform?",
    a: "The people who run this instance review every application before it opens, and email you their decision. If you host it yourself, that is you.",
  },
];

