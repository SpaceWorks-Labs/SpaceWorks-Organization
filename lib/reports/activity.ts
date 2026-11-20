/**
 * Audit actions grouped for the manager activity report and the organisation activity log. Client-safe. An action
 * falls into the first category whose test matches, else "other", so the order below matters: specific families first.
 */
export const ACTIVITY_CATEGORIES = [
  { key: "decisions", label: "Approvals and decisions", test: (action: string) => /^MEMBERSHIP_(APPROVE|REJECT|REVOKE|REINSTATE|CANCEL)/.test(action) },
  { key: "cards", label: "Cards", test: (action: string) => action.startsWith("CARD_") },
  { key: "messaging", label: "Messaging and consent", test: (action: string) => /^(CONSENT_|MESSAGING_|ORG_MESSAGING_|CHAT_|WHATSAPP_|ORG_EMAIL_)/.test(action) },
  { key: "ledger", label: "Accounts ledger", test: (action: string) => /^(LEDGER_|OPENING_BALANCE)/.test(action) },
  { key: "groupings", label: "Groupings and smart groups", test: (action: string) => /^(SMART_GROUP|GROUPING_|MEMBER_GROUPINGS_|TEAM_GROUPING_)/.test(action) },
  { key: "erasure", label: "Erasure and privacy", test: (action: string) => /^(ERASURE_|MEMBER_ANONYMISED)/.test(action) },
  // Before the member and payment families: MEMBER_ROLE_*, MEMBER_PORTAL_SET and PAYMENT_GATEWAY_SAVED are setup.
  { key: "setup", label: "Team and settings", test: (action: string) => /^(TEAM_|ORGANISATION_|UNIT_|ROLE_|STAFF_ROLE|MEMBER_ROLE_CREATED|MEMBER_PORTAL_SET|MEMBER_PHOTO_UPLOAD_SET|SETTINGS_|OWNERSHIP_|PAYMENT_GATEWAY_|TAX_SETTINGS|REFUND_POLICY|OFFLINE_PAYMENT_SETTINGS|PUBLIC_PAGE_|LOGIN_METHODS|ORG_WEB_TELEMETRY)/.test(action) },
  { key: "memberships", label: "Memberships", test: (action: string) => action.startsWith("MEMBERSHIP_") || action.startsWith("TERM_") },
  { key: "members", label: "Member records", test: (action: string) => action.startsWith("MEMBER_") || action.startsWith("MEMBERS_IMPORTED") },
  { key: "money", label: "Payments and receipts", test: (action: string) => /^(PAYMENT|REFUND|RECEIPT|OFFLINE)_/.test(action) },
  { key: "reminders", label: "Reminders", test: (action: string) => action.startsWith("RENEWAL_REMINDER") },
  { key: "exports", label: "Exports", test: (action: string) => action.endsWith("_EXPORTED") },
  { key: "plans", label: "Plans", test: (action: string) => action.startsWith("PLAN_") },
] as const;

/** A person's own sign-in and account security. Never part of an organisation's log, even if an event carries an organisation. */
export const isAccountSecurityAction = (action: string): boolean =>
  /^(PASSKEY_|PHONE_|SESSION_|SESSIONS_|MFA_|SIGN_IN_|SIGN_OUT|RECOVERY_CODE|IDENTITY_|ACCOUNT_|IP_)/.test(action);

/** Actions a member does themselves (portal), whoever the log is read by. */
export const isMemberInitiatedAction = (action: string): boolean =>
  /_BY_MEMBER$/.test(action) || ["MEMBER_LEFT", "REFUND_REQUESTED", "REFUND_REQUEST_WITHDRAWN", "ERASURE_REQUESTED", "ERASURE_WITHDRAWN", "CONSENT_WITHDRAWN"].includes(action);

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["key"] | "account" | "other";

export function activityCategory(action: string): ActivityCategory {
  if (isAccountSecurityAction(action)) return "account";
  return ACTIVITY_CATEGORIES.find((category) => category.test(action))?.key ?? "other";
}

/** "MEMBERSHIP_APPROVE" → "Membership approve". */
export function actionLabel(action: string): string {
  const words = action.toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
}
