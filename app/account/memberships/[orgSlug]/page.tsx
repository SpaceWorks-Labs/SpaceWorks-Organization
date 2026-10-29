import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { loadMembershipDetailView } from "@/lib/views/app__account__memberships__orgSlug__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { money } from "@/lib/membership/describe";
import { RoleChip } from "@/components/members/RoleChip";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { MembershipActions } from "@/components/portal/MembershipActions";
import { MembershipHistory } from "@/components/portal/MembershipHistory";
import { RefundRequestPanel } from "@/components/portal/RefundRequestPanel";
import { PortalPhotoField } from "@/components/portal/PortalPhotoField";
import { PortalProfileForm } from "@/components/portal/PortalProfileForm";
import { ReceiptsSlot } from "@/components/portal/Slots";
import { standingLine } from "@/components/portal/WalletCard";
import { Card, CardHeader, OrgLogo } from "@/components/ui/display";

export const metadata: Metadata = { title: "Membership", robots: { index: false, follow: false } };

export default async function MembershipDetailPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, member, roles, fields, memberships, receipts } = await loadMembershipDetailView({ params });
  const since = formatCalendarDate(localDate(member.createdAt, org.timezone));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/account" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Your memberships
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="break-words text-h2 text-ink">{org.name}</h2>
          <p className="text-caption tabular-nums text-ink-muted">Member no. {member.memberNumber}{member.unitName ? ` · ${member.unitName}` : ""} · since {since}</p>
          {roles.length ? (
            <ul aria-label="Your roles" className="mt-1 flex flex-wrap gap-1.5">
              {roles.map((role) => <li key={role.name}><RoleChip name={role.name} color={role.color} primary={role.isPrimary} /></li>)}
            </ul>
          ) : null}
        </div>
        <Link href={`/o/${org.slug}`} className="inline-flex items-center gap-1 text-label text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
          Public page
          <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {memberships.map((membership) => (
            <Card as="section" key={membership.plan.id} className="rounded-xl" aria-labelledby={`plan-${membership.plan.id}`}>
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id={`plan-${membership.plan.id}`} className="text-h4 text-ink">{membership.plan.name}</h3>
                  <TermStatusChip status={membership.state.status} size="md" />
                </div>
                {standingLine(membership, org.name, org.timezone) ? <p className="text-body-ui text-ink-secondary">{standingLine(membership, org.name, org.timezone)}</p> : null}
                <MembershipActions
                  organisationSlug={org.slug}
                  organisationName={org.name}
                  planId={membership.plan.id}
                  planName={membership.plan.name}
                  actions={membership.state.actions}
                  due={membership.due ? money(membership.due.minor, membership.due.currency, org.locale) : null}
                />
                {membership.refund ? (() => {
                  const refund = membership.refund;
                  const day = (date: Date) => formatCalendarDate(localDate(date, org.timezone));
                  const amount = (minor: number) => money(minor, refund.currency, org.locale);
                  return (
                    <RefundRequestPanel
                      organisationSlug={org.slug}
                      organisationName={org.name}
                      planName={membership.plan.name}
                      termId={refund.termId}
                      policyText={refund.policyText}
                      offer={refund.offer.eligible ? amount(refund.offer.amountMinor) : null}
                      deadline={refund.offer.deadline ? day(refund.offer.deadline) : null}
                      windowClosed={!refund.offer.eligible && refund.offer.reason === "window-closed"}
                      open={refund.open ? { id: refund.open.id, amount: amount(refund.open.suggestedMinor), date: day(refund.open.createdAt) } : null}
                      last={refund.last ? { status: refund.last.status, note: refund.last.decisionNote, amount: refund.last.refundedMinor === null ? null : amount(refund.last.refundedMinor) } : null}
                    />
                  );
                })() : null}
              </div>
              <h4 className="mb-3 text-label font-semibold text-ink">History</h4>
              <MembershipHistory terms={membership.terms} timeZone={org.timezone} locale={org.locale} />
            </Card>
          ))}
          <ReceiptsSlot receipts={receipts} timeZone={org.timezone} locale={org.locale} />
        </div>
        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="Your details" description={`What ${org.name} knows about you. Keep it up to date.`} />
          <PortalPhotoField organisationSlug={org.slug} organisationName={org.name} name={member.name} photoUrl={member.photoUrl} canUpload={org.photoUpload} />
          <PortalProfileForm
            organisationSlug={org.slug}
            organisationName={org.name}
            unitLabel={org.unitLabel}
            fields={fields}
            initial={{
              name: member.name, email: member.email, phone: member.phone, stateCode: member.stateCode,
              isMinor: member.isMinor, guardianName: member.guardianName, guardianEmail: member.guardianEmail, guardianPhone: member.guardianPhone,
              unitName: member.unitName, hasUnits: member.hasUnits, fieldValues: member.fieldValues,
            }}
          />
          <p className="mt-5 text-caption text-ink-muted">
            Consent, your data and erasure are under <Link href="/account/privacy" className="underline underline-offset-4 hover:text-ink">Privacy</Link>.
          </p>
        </Card>
      </div>
    </div>
  );
}
