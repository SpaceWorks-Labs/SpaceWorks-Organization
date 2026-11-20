/** Where an audit event's subject lives in the dashboard. Pure, so it is shared by readers, pages and tests. */

type Meta = Record<string, unknown> | null | undefined;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const safeId = (value: unknown): string | null => (typeof value === "string" && SAFE_ID.test(value) ? value : null);
const meta = (metadata: Meta, key: string) => safeId(metadata?.[key]);

/**
 * The dashboard page for an event's target, or null when there is none (organisation-level events, secrets,
 * things that no longer have a page). `metadata.memberId` / `paymentId` reach terms, cards and refunds.
 */
export function targetHref(orgSlug: string, targetType: string | null | undefined, targetId: string | null | undefined, metadata?: Meta): string | null {
  if (!SAFE_ID.test(orgSlug)) return null;
  const base = `/dashboard/${orgSlug}`;
  const id = safeId(targetId);
  const member = meta(metadata, "memberId");
  const toMember = (memberId: string | null) => (memberId ? `${base}/members/${memberId}` : null);
  switch (targetType) {
    case "Member": return toMember(id);
    case "MembershipTerm":
    case "MemberCard":
    case "ErasureRequest":
    case "ConsentRecord": return toMember(member);
    case "Payment": return id ? `${base}/payments/${id}` : null;
    case "Refund":
    case "RefundRequest": {
      const payment = meta(metadata, "paymentId");
      return payment ? `${base}/payments/${payment}` : toMember(member);
    }
    case "OrgUnit": return id ? `${base}/settings/structure/${id}` : null;
    case "MembershipPlan": return id ? `${base}/plans/${id}` : null;
    case "SmartGroup": return id ? `${base}/members?sg=${id}` : null;
    case "OrgGroupingValue": return id ? `${base}/members?gv=${id}` : null;
    case "OrgGrouping": return `${base}/settings/groupings`;
    case "OrgRole": return `${base}/settings/roles`;
    case "CardDesign": return `${base}/settings/cards`;
    case "LedgerEntry": return `${base}/accounts`;
    case "TeamInvite":
    case "teamMember": return `${base}/team`;
    default: return null;
  }
}

/** A readable name for a target type: "MembershipTerm" → "Membership term". */
export function targetLabel(targetType: string | null | undefined): string {
  if (!targetType) return "Organisation";
  const words = targetType.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}
