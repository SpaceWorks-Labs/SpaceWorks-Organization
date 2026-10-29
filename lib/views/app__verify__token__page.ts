import { recordThrottledAuditEvent } from "@/lib/audit";
import { publicCardImages } from "@/lib/cards/publicCard";
import { staffScanAccess } from "@/lib/cards/staffScan";
import { lookupVerification } from "@/lib/cards/verifyLookup";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import { loadMemberPayments } from "@/lib/views/app__dashboard__orgSlug__members__memberId__payments";

/**
 * A scanned card, read now. Everyone gets the public check, with the card itself while it is live and current.
 * Staff of the card's organisation who may see the member also get the member's memberships, payments and cards
 * here (lib/cards/staffScan.ts), read through the member page's own loaders. Rate limited in proxy.ts.
 */
export async function loadVerifyView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const checkedAt = new Date();
  const view = await lookupVerification(token, checkedAt);
  const access = await staffScanAccess(token);
  if (access?.authenticator) {
    await recordThrottledAuditEvent({ action: "CARD_SCANNED", actorUserId: access.userId, organisationId: access.organisationId, targetType: "MemberCard", targetId: access.card.id, windowMs: 10 * 60_000 });
    const memberParams = Promise.resolve({ orgSlug: access.orgSlug, memberId: access.memberId });
    // One after the other, like the member page, so a super admin's throttled entry is recorded once.
    const member = await loadMemberView({ params: memberParams });
    const payments = await loadMemberPayments({ params: memberParams });
    const staff = {
      state: "panel" as const,
      card: { number: access.card.number, state: access.card.state },
      org: member.org,
      member: {
        id: member.member.id,
        name: member.member.name,
        memberNumber: member.member.memberNumber,
        unitName: member.member.unit?.name ?? null,
        contact: member.showContact ? { email: member.member.email, phone: member.member.phone } : null,
      },
      memberships: member.memberships,
      cards: member.cards,
      canManage: member.canManage,
      canManageCards: member.canManageCards,
      payments,
    };
    return { view, checkedAt, images: null, staff };
  }
  const images = view.state === "member" && (view.verdict === "valid" || view.verdict === "grace") ? await publicCardImages(token, checkedAt) : null;
  return { view, checkedAt, images, staff: access ? { state: "authenticator" as const } : null };
}
