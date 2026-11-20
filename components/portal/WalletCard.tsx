import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { money } from "@/lib/membership/describe";
import type { WalletEntry, WalletMembership } from "@/lib/portal/wallet";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { RoleChip } from "@/components/members/RoleChip";
import { MembershipActions } from "@/components/portal/MembershipActions";
import { CardSlot } from "@/components/portal/Slots";
import type { WalletCard as MemberCardData } from "@/lib/cards/wallet";
import { Callout, OrgLogo } from "@/components/ui/display";

/** One line on where a membership stands, in words: validity, grace, renewal timing or the next step. */
export function standingLine(membership: Pick<WalletMembership, "state">, organisationName: string, timeZone: string): string | null {
  const { state } = membership;
  const day = (date: Date) => formatCalendarDate(localDate(date, timeZone));
  const days = (count: number) => (count === 1 ? "1 day" : `${count} days`);
  switch (state.status) {
    case "ACTIVE": {
      if (!state.validUntil) return "Valid for life";
      const parts = [`Valid until ${formatCalendarDate(state.validUntil)}`];
      if (state.daysLeft !== null && state.daysLeft <= 60) parts.push(`${days(state.daysLeft)} left`);
      if (state.renewedUntil) parts.push(`renewed until ${formatCalendarDate(state.renewedUntil)}`);
      else if (state.renewalOpensAt) parts.push(`renewal opens ${day(state.renewalOpensAt)}`);
      return parts.join(" · ");
    }
    case "GRACE":
      return `Ended ${state.validUntil ? formatCalendarDate(state.validUntil) : "recently"}. Renew within ${days(state.daysLeft ?? 0)} to keep it continuous.`;
    case "UPCOMING":
      return state.renewedUntil ? `Starts soon, valid until ${formatCalendarDate(state.renewedUntil)}` : "Starts soon";
    case "PENDING_APPROVAL":
      return `Waiting for ${organisationName} to approve your application.`;
    case "PENDING_PAYMENT":
      return "Approved. Your membership starts once it's paid.";
    case "LAPSED":
      return state.validUntil ? `Ended ${formatCalendarDate(state.validUntil)}.` : "Ended.";
    case "EXPIRED":
      return "The payment window closed before it was paid.";
    case "CANCELLED":
      return "You left, or this was called off.";
    case "REVOKED":
      return `Revoked by ${organisationName}. Contact them with questions.`;
    case "REJECTED":
      return `${organisationName} didn't approve this application.`;
    default:
      return null;
  }
}

/** One organisation in the wallet: who you are there and each membership with what you can do next. */
export function WalletCard({ entry, cards = [] }: { entry: WalletEntry; cards?: MemberCardData[] }) {
  const org = entry.organisation;
  const detail = `/account/memberships/${org.slug}`;
  return (
    <article aria-labelledby={`wallet-${entry.memberId}`} className="flex flex-col rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-4 border-b border-line p-5">
        <OrgLogo name={org.name} src={org.logoUrl} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={`wallet-${entry.memberId}`} className="truncate text-h4 text-ink">{org.name}</h3>
          <p className="text-caption tabular-nums text-ink-muted">
            Member no. {entry.memberNumber}{entry.unitName ? ` · ${entry.unitName}` : ""}
          </p>
          {entry.roles.length ? (
            <ul aria-label="Your roles" className="mt-1 flex flex-wrap gap-1.5">
              {entry.roles.map((role) => <li key={role.name}><RoleChip name={role.name} color={role.color} primary={role.isPrimary} /></li>)}
            </ul>
          ) : null}
        </div>
        <Link href={detail} className="inline-flex items-center gap-1 rounded-full text-label text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
          Details and history
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </header>
      {org.status !== "ACTIVE" ? (
        <Callout tone="info" className="mx-5 mt-4">
          {org.status === "SUSPENDED" ? `${org.name} is paused on this platform, so renewals wait until it reopens.` : `${org.name} has closed on this platform. Your history stays here.`}
        </Callout>
      ) : null}
      {entry.erasurePending ? <Callout tone="info" className="mx-5 mt-4">You asked {org.name} to erase your details. They&apos;ll email you their decision.</Callout> : null}
      <ul className="flex flex-col divide-y divide-line">
        {entry.memberships.map((membership) => (
          <li key={membership.planId} className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-label font-semibold text-ink">{membership.planName}</h4>
              <TermStatusChip status={membership.state.status} size="md" />
            </div>
            {standingLine(membership, org.name, org.timezone) ? <p className="text-body-ui text-ink-secondary">{standingLine(membership, org.name, org.timezone)}</p> : null}
            <MembershipActions
              organisationSlug={org.slug}
              organisationName={org.name}
              planId={membership.planId}
              planName={membership.planName}
              actions={membership.state.actions}
              reask={membership.reask}
              due={membership.due ? money(membership.due.minor, membership.due.currency, org.locale) : null}
            />
            <CardSlot card={cards.find((card) => card.planId === membership.planId) ?? null} />
          </li>
        ))}
      </ul>
    </article>
  );
}
