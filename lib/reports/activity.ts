/**
 * Audit actions grouped for the B12 manager activity report. Client-safe. A new action falls into the
 * first category whose test matches, else "other".
 */
export const ACTIVITY_CATEGORIES = [
  { key: "decisions", label: "Approvals and decisions", test: (action: string) => /^MEMBERSHIP_(APPROVE|REJECT|REVOKE|REINSTATE|CANCEL)/.test(action) },
  { key: "memberships", label: "Memberships", test: (action: string) => action.startsWith("MEMBERSHIP_") || action.startsWith("TERM_") },
  { key: "members", label: "Member records", test: (action: string) => action.startsWith("MEMBER_") || action.startsWith("MEMBERS_IMPORTED") },
  { key: "money", label: "Payments and receipts", test: (action: string) => /^(PAYMENT|REFUND|RECEIPT|OFFLINE)_/.test(action) },
  { key: "reminders", label: "Reminders", test: (action: string) => action.startsWith("RENEWAL_REMINDER") },
  { key: "exports", label: "Exports", test: (action: string) => action.endsWith("_EXPORTED") },
  { key: "plans", label: "Plans", test: (action: string) => action.startsWith("PLAN_") },
  { key: "setup", label: "Team and settings", test: (action: string) => /^(TEAM_|ORGANISATION_|UNIT_|ROLE_|MEMBER_ROLE_|SETTINGS_)/.test(action) },
] as const;

type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["key"] | "other";

export function activityCategory(action: string): ActivityCategory {
  return ACTIVITY_CATEGORIES.find((category) => category.test(action))?.key ?? "other";
}

/** "MEMBERSHIP_APPROVE" → "Membership approve". */
export function actionLabel(action: string): string {
  const words = action.toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
}
