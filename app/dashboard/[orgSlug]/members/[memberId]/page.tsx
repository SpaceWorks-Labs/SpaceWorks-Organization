import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import { loadMemberPayments } from "@/lib/views/app__dashboard__orgSlug__members__memberId__payments";
import { MemberPaymentsSection } from "@/components/payments/MemberPaymentsSection";
import { MemberPhotoField } from "@/components/members/MemberPhotoField";
import { TERM_STATUS_LABELS } from "@/lib/membership/lifecycle";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { MembershipPanel } from "@/components/members/MembershipPanel";
import { membershipViews } from "@/components/members/membershipViews";
import { MemberProfileForm } from "@/components/members/MemberProfileForm";
import { MemberRolesPicker } from "@/components/members/MemberRolesPicker";
import { MemberCardPanel } from "@/components/cards/MemberCardPanel";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { ErasureRequestCard } from "@/components/members/ErasureRequestCard";
import { Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Member", robots: { index: false, follow: false } };

export default async function MemberPage({ params }: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const view = await loadMemberView({ params });
  const payments = await loadMemberPayments({ params });
  const { org, member } = view;
  const tz = org.timezone;
  const day = (date: Date) => formatCalendarDate(localDate(date, tz));
  const memberships = membershipViews(view.memberships, org);
  const values = (member.fieldValues ?? {}) as Record<string, string | boolean>;
  const primary = member.roles.find((assignment) => assignment.isPrimary)?.roleId ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/members`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Members
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <MemberPhotoField slug={org.slug} memberId={member.id} name={member.name} photoUrl={member.photoUrl} canManage={view.canManage && !member.anonymisedAt} />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-h1 text-ink">{member.name}</h1>
          <p className="text-caption tabular-nums text-ink-muted">
            Member no. {member.memberNumber}{member.unit ? ` · ${member.unit.name}` : ""} · joined {day(member.createdAt)}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {view.memberships.map((m) => <TermStatusChip key={m.planId} status={m.status} prefix={m.planName} size="md" />)}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <MembershipPanel slug={org.slug} memberId={member.id} memberships={memberships} plans={view.plans} canManage={view.canManage} />
          {payments ? <MemberPaymentsSection data={payments} /> : null}
          <Card as="section" className="rounded-xl">
            <CardHeader title="Details" />
            <MemberProfileForm
              slug={org.slug}
              memberId={member.id}
              units={view.units}
              unitLabel={org.unitLevels.at(-1) ?? "Unit"}
              fields={view.fields}
              disabled={!view.canManage || !view.showContact}
              initial={{
                name: member.name, email: view.showContact ? member.email : "hidden", phone: view.showContact ? member.phone ?? "" : "",
                stateCode: member.stateCode ?? "", unitId: member.unitId ?? "", isMinor: member.isMinor,
                guardianName: member.guardianName ?? "", guardianEmail: member.guardianEmail ?? "", guardianPhone: member.guardianPhone ?? "",
                fieldValues: values,
              }}
            />
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <MemberCardPanel slug={org.slug} memberId={member.id} memberName={member.name} plans={view.cards} canManage={view.canManageCards} />
          <ErasureRequestCard slug={org.slug} requests={member.erasureRequests} anonymisedAt={member.anonymisedAt} canManage={view.canDecideErasure} timeZone={tz} />
          <MemberRolesPicker slug={org.slug} memberId={member.id} roles={view.roles} initial={member.roles.map((a) => a.roleId)} initialPrimary={primary} canManage={view.canManage} />
          <Card as="section" className="rounded-xl">
            <CardHeader title="History" />
            {view.timeline.length === 0 ? <p className="text-body-ui text-ink-muted">Nothing yet.</p> : (
              <ol className="flex flex-col gap-3">
                {view.timeline.map((event) => (
                  <li key={event.id} className="flex flex-col border-l-2 border-line pl-4">
                    <span className="text-label font-semibold text-ink">{event.planName}: {TERM_STATUS_LABELS[event.to]}</span>
                    <span className="text-caption text-ink-muted">{day(event.effectiveAt)} · {event.cause.replace(/-/g, " ")}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card as="section" className="rounded-xl">
            <CardHeader title="Consent" />
            {member.consents.length === 0 ? <p className="text-body-ui text-ink-muted">No consent recorded. Members who join online agree to the privacy notice.</p> : (
              <ul className="flex flex-col gap-2 text-body-ui text-ink-secondary">
                {member.consents.map((consent) => (
                  <li key={consent.id}>
                    {consent.purpose === "membership" ? "Privacy notice" : consent.purpose} ({consent.noticeVersion}) agreed {day(consent.grantedAt)}
                    {consent.byGuardian ? " by a guardian" : ""}{consent.withdrawnAt ? `, withdrawn ${day(consent.withdrawnAt)}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
