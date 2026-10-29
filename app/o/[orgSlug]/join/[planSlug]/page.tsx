import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadJoinView } from "@/lib/views/app__o__orgSlug__join__planSlug__page";
import { describeDuration, describePrice } from "@/lib/membership/describe";
import { TERM_STATUS_LABELS, type TermStatus } from "@/lib/membership/lifecycle";
import { JoinForm } from "@/components/public/JoinForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string; planSlug: string }>; searchParams: Promise<{ invite?: string; unit?: string }> };

const LIVE: TermStatus[] = ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING", "ACTIVE", "GRACE"];

export default async function JoinPage({ params, searchParams }: Props) {
  const view = await loadJoinView({ params, searchParams });
  const { org, plan, user } = view;
  const { price, extras } = describePrice(plan, org.locale);
  const query = new URLSearchParams([...(view.inviteToken ? [["invite", view.inviteToken]] : []), ...(view.unitCode ? [["unit", view.unitCode]] : [])]).toString();
  const here = `/o/${org.slug}/join/${plan.slug}${query ? `?${query}` : ""}`;

  let body: React.ReactNode;
  if (!view.open) {
    body = (
      <Callout tone="info" title={plan.joinMode === "INVITE_ONLY" ? "By invitation only" : "Not taking members"}>
        {view.inviteState === "unusable" ? "This invitation has expired, been used, or was withdrawn. Ask the organisation for a new one." : plan.joinMode === "INVITE_ONLY" ? `${org.name} invites people to this plan directly.` : `${org.name} isn't taking new members on this plan right now.`}
      </Callout>
    );
  } else if (!user) {
    body = (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-h3 text-ink">Sign in to join</h2>
        <p className="text-body-ui text-ink-secondary">Your account keeps your membership, card and receipts in one place, across every organisation you join.</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/login?callbackUrl=${encodeURIComponent(here)}`} className={buttonClasses({ variant: "accent" })}>Sign in or create an account</Link>
        </div>
      </div>
    );
  } else if (!user.verified) {
    body = <Callout tone="warning" title="Verify your email first" action={<Link href="/account" className={buttonClasses({ variant: "secondary", size: "sm" })}>Go to your account</Link>}>We send membership updates by email, so your address needs to be verified before you join.</Callout>;
  } else if (view.inviteState === "other-email") {
    body = <Callout tone="warning" title="This invitation is for someone else">It was sent to a different email address. Sign in with that address to use it.</Callout>;
  } else if (view.unitNotOffered) {
    body = <Callout tone="info" title="Not offered in your unit">{`You're a member through ${view.unitNotOffered}, and ${org.name} doesn't offer this plan there. Ask them about moving units.`}</Callout>;
  } else if (view.standing && LIVE.includes(view.standing as TermStatus)) {
    body = <Callout tone="info" title={`You're ${TERM_STATUS_LABELS[view.standing as TermStatus].toLowerCase()} on this plan`} action={<Link href="/account" className={buttonClasses({ variant: "secondary", size: "sm" })}>Your account</Link>}>Everything about your membership is in your account.</Callout>;
  } else {
    body = (
      <JoinForm
        orgSlug={org.slug}
        planSlug={plan.slug}
        inviteToken={view.inviteToken}
        user={{ name: user.name, email: user.email }}
        units={view.units}
        unitLabel={view.unitLabel}
        presetUnitId={view.presetUnitId}
        approval={plan.joinMode === "APPROVAL"}
        questions={plan.fields.map(({ key, label, helpText, type, required, options }) => ({ key, label, helpText, type, required, options }))}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 py-10 sm:px-6">
      <Link href={`/o/${org.slug}`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        {org.name}
      </Link>
      <header className="flex flex-col gap-3">
        <h1 className="text-h1 text-ink">Join {org.name}</h1>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-h3 text-ink">{plan.name}</span>
          <span className="text-body-ui tabular-nums text-ink-secondary">{price}{extras.length ? ` · ${extras.join(" · ")}` : ""} · {describeDuration(plan, org.financialYearStartMonth)}</span>
        </div>
        {plan.description ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{plan.description}</p> : null}
      </header>
      {body}
    </div>
  );
}
