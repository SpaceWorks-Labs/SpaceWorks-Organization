import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { loadOrgOverviewView } from "@/lib/views/app__dashboard__orgSlug__page";
import { STATUS_EXPLANATIONS } from "@/lib/organisationLifecycle";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { DigestToggle } from "@/components/dashboard/org/DigestToggle";
import { HomeCharts } from "@/components/dashboard/org/HomeCharts";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, StatTile } from "@/components/ui/display";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Overview", robots: { index: false, follow: false } };

export default async function OrgOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { organisation, roleName, teamCount, openInvites, members, steps, digest, analytics } = await loadOrgOverviewView({ params });
  const remaining = steps.filter((step) => !step.done).length;
  const base = `/dashboard/${organisation.slug}`;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={organisation} title="Overview" description={`You're ${/^[aeiou]/i.test(roleName) ? "an" : "a"} ${roleName.toLowerCase()} here.`} />

      {organisation.status !== "ACTIVE" ? (
        <Callout
          tone="danger"
          title={STATUS_EXPLANATIONS[organisation.status].title}
          action={<Link href={`/dashboard/${organisation.slug}/application`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Details</Link>}
        >
          {STATUS_EXPLANATIONS[organisation.status].body}
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {members ? (
          <>
            <StatTile className="rounded-xl" label="Active members" value={members.active.toLocaleString("en-IN")} hint="Including those in grace" href={`${base}/members?status=active`} />
            <StatTile className="rounded-xl" label="Waiting for approval" value={members.approval.toLocaleString("en-IN")} hint={members.approval ? "Review applications" : "Nothing to review"} href={`${base}/members?status=approval`} />
            <StatTile className="rounded-xl" label="Payment pending" value={members.payment.toLocaleString("en-IN")} hint="Approved, not yet paid" href={`${base}/members?status=payment`} />
            <StatTile className="rounded-xl" label="Renewals due" value={members.renewals.toLocaleString("en-IN")} hint="Ending in the next 30 days" href={`${base}/members?status=expiring`} />
          </>
        ) : null}
        <StatTile className="rounded-xl" label="Team" value={teamCount.toLocaleString("en-IN")} hint={openInvites ? `${openInvites} open invite${openInvites === 1 ? "" : "s"}` : "No open invites"} href={`${base}/team`} />
      </div>

      {steps.length > 0 ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Get set up" description={remaining ? `${remaining} of ${steps.length} left` : "All done. Nice work."} />
          <ol className="flex flex-col divide-y divide-line">
            {steps.map((step) => (
              <li key={step.id}>
                <Link href={step.href} className="group flex items-center gap-4 py-3.5">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border",
                      step.done ? "border-transparent bg-success-bg text-success-fg" : "border-line-strong text-transparent",
                    )}
                  >
                    <Check className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("text-label font-semibold", step.done ? "text-ink-muted line-through" : "text-ink")}>
                      <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                      {step.label}
                    </span>
                    <span className="text-caption text-ink-muted">{step.description}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      {analytics ? <HomeCharts slug={organisation.slug} analytics={analytics} /> : null}
      {digest !== null ? <DigestToggle slug={organisation.slug} initial={digest} /> : null}
    </div>
  );
}
