import { TERM_STATUS_LABELS, type TermStatus } from "@/lib/membership/lifecycle";

/** Plain words for why a membership changed, as the member reads it in their history. Client-safe. */
const CAUSES: Record<string, string> = {
  applied: "You applied",
  "sent-to-verify": "Added by the organisation, waiting to be verified",
  "renewal-started": "Renewal started",
  approved: "Approved",
  paid: "Payment received",
  "activated-before-payment": "Started, to be paid later",
  "free-plan": "Started",
  renewed: "Renewed",
  reject: "Not approved",
  cancel: "Called off by the organisation",
  withdraw: "Called off",
  revoke: "Revoked by the organisation",
  reinstated: "Reinstated",
  extended: "End date changed",
  sweep: "Updated on schedule",
};

export function historyCause(cause: string): string {
  return CAUSES[cause] ?? cause.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());
}

export function historyLine(event: { to: TermStatus; cause: string }): string {
  return `${TERM_STATUS_LABELS[event.to]} · ${historyCause(event.cause)}`;
}
