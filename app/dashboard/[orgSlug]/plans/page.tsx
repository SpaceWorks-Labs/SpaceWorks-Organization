import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadOrgPlansView } from "@/lib/views/app__dashboard__orgSlug__plans__page";
import { describeDuration, describePrice, JOIN_MODE_LABELS } from "@/lib/membership/describe";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { buttonClasses } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Membership plans", robots: { index: false, follow: false } };

export default async function OrgPlansPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, canManage, plans } = await loadOrgPlansView({ params });
  const base = `/dashboard/${org.slug}/plans`;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader
        organisation={org}
        title="Membership plans"
        description="What people join: how long it lasts, what it costs and how they get in."
        actions={canManage ? (
          <Link href={`${base}/new`} className={buttonClasses({ variant: "primary" })}>
            <Plus aria-hidden className="size-4" />
            New plan
          </Link>
        ) : undefined}
      />

      {plans.length === 0 ? (
        <EmptyState
          patch
          title="No plans yet"
          action={canManage ? <Link href={`${base}/new`} className={buttonClasses({ variant: "primary" })}>Create your first plan</Link> : undefined}
        >
          A plan is what people join: for example an annual membership, a student plan or a lifetime membership.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const { price, extras } = describePrice(plan, org.locale);
            return (
              <li key={plan.id}>
                <Link
                  href={`${base}/${plan.id}`}
                  className={cn("flex h-full flex-col gap-4 rounded-xl border border-line p-5 transition-colors duration-(--sw-dur-fast) ease-sw hover:border-line-strong hover:bg-subtle", plan.archivedAt ? "bg-surface" : "bg-panel")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-h4 text-ink">{plan.name}</h2>
                      <p className="text-caption text-ink-muted">{describeDuration(plan, org.financialYearStartMonth)}</p>
                    </div>
                    {plan.archivedAt ? <Chip size="sm">Archived</Chip> : <Chip size="sm" tone="outline">{JOIN_MODE_LABELS[plan.joinMode].label}</Chip>}
                  </div>
                  <div>
                    <p className="text-h3 tabular-nums text-ink">{price}</p>
                    {extras.length ? <p className="text-caption text-ink-secondary">{extras.join(" · ")}</p> : null}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-caption text-ink-secondary">
                    <span><span className="font-semibold text-ink tabular-nums">{plan.active}</span> active</span>
                    {plan.waiting ? <span><span className="font-semibold text-ink tabular-nums">{plan.waiting}</span> waiting</span> : null}
                    <span className="ml-auto">{plan.allUnits ? "All units" : plan.unitNames.join(", ")}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
