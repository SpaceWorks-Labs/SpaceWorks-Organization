import Link from "next/link";
import { MemberCardPanel } from "@/components/cards/MemberCardPanel";
import { MembershipPanel } from "@/components/members/MembershipPanel";
import { membershipViews } from "@/components/members/membershipViews";
import { MemberPaymentsSection } from "@/components/payments/MemberPaymentsSection";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, DetailList } from "@/components/ui/display";
import type { loadVerifyView } from "@/lib/views/app__verify__token__page";

type Panel = Extract<NonNullable<Awaited<ReturnType<typeof loadVerifyView>>["staff"]>, { state: "panel" }>;

const CARD_STATES = { live: "Live", replaced: "Replaced by a newer card", revoked: "Revoked" } as const;

/**
 * What staff of the card's organisation see after a scan: the member in their own organisation only, with the
 * member page's own panels, so each action runs the same server action and permission checks as there.
 */
export function StaffScanPanel({ staff }: { staff: Panel }) {
  const { org, member } = staff;
  return (
    <>
      <Card as="section" className="rounded-xl">
        <CardHeader
          title={member.name}
          description={`Your record of this member in ${org.name}.`}
          action={<Link href={`/dashboard/${org.slug}/members/${member.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Open member page</Link>}
        />
        <DetailList
          items={[
            { label: "Member no.", value: <span className="tabular-nums">{member.memberNumber}</span> },
            ...(member.unitName ? [{ label: org.unitLevels.at(-1) ?? "Unit", value: member.unitName }] : []),
            { label: "Card", value: <span className="tabular-nums">{staff.card.number} · {CARD_STATES[staff.card.state]}</span> },
            ...(member.contact ? [{ label: "Email", value: member.contact.email }, { label: "Phone", value: member.contact.phone ?? "Not given" }] : []),
          ]}
        />
      </Card>
      <MembershipPanel slug={org.slug} memberId={member.id} memberships={membershipViews(staff.memberships, org)} plans={[]} canManage={staff.canManage} />
      {staff.payments ? <MemberPaymentsSection data={staff.payments} /> : null}
      <MemberCardPanel slug={org.slug} memberId={member.id} memberName={member.name} plans={staff.cards} canManage={staff.canManageCards} />
    </>
  );
}
