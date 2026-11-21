import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { describeDuration, describePrice, JOIN_MODE_LABELS } from "@/lib/membership/describe";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { PlanGrid } from "./PlanGrid";

export type PublicPlan = {
  id: string; name: string; slug: string; description: string; currency: string;
  durationType: "ROLLING" | "ORG_YEAR" | "FIXED_END" | "LIFETIME"; durationMonths: number | null; fixedEndDate: Date | string | null;
  priceNewMinor: number; priceRenewalMinor: number; joiningFeeMinor: number;
  joinMode: "OPEN" | "APPROVAL" | "INVITE_ONLY" | "CLOSED"; allUnits: boolean;
  units: Array<{ unit: { name: string } }>;
};

/** The organisation's open plans, live from the database, each with its join button. They rise in once (delight). */
export function PlanCards({ org, plans, takingMembers, preview = false, areaCode = null }: {
  org: { name: string; slug: string; locale: string | null; financialYearStartMonth: number };
  plans: PublicPlan[];
  takingMembers: boolean;
  /** In the editor preview the join buttons don't navigate. */
  preview?: boolean;
  /** On an area page: join links carry `?unit=CODE`. */
  areaCode?: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {!takingMembers ? <Callout tone="info">{org.name} isn&apos;t taking new members right now. Existing members can still sign in to see their membership.</Callout> : null}
      {plans.length === 0 ? <EmptyState>No membership plans are open yet.</EmptyState> : (
        <PlanGrid className="grid grid-cols-1 gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {plans.map((plan) => {
            const { price, extras } = describePrice(plan, org.locale);
            const joinable = takingMembers && plan.joinMode !== "CLOSED" && plan.joinMode !== "INVITE_ONLY";
            const label = plan.joinMode === "APPROVAL" ? "Apply to join" : "Join";
            return (
              <li key={plan.id} className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-h3 text-ink">{plan.name}</h3>
                  <p className="text-caption text-ink-muted">{describeDuration(plan, org.financialYearStartMonth)}</p>
                </div>
                <div>
                  <p className="text-h2 tabular-nums text-ink">{price}</p>
                  {extras.length ? <p className="text-caption text-ink-secondary">{extras.join(" · ")}</p> : null}
                </div>
                {plan.description ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{plan.description}</p> : null}
                {!plan.allUnits ? <p className="text-caption text-ink-muted">For {plan.units.map((entry) => entry.unit.name).join(", ")}</p> : null}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  {joinable ? (
                    preview ? (
                      <span className={buttonClasses({ variant: "accent", fullWidth: true })}>{label}<ArrowUpRight aria-hidden className="size-4" /></span>
                    ) : (
                      <Link href={`/o/${org.slug}/join/${plan.slug}${areaCode ? `?unit=${areaCode}` : ""}`} className={buttonClasses({ variant: "accent", fullWidth: true })}>
                        {label}
                        <ArrowUpRight aria-hidden className="size-4" />
                      </Link>
                    )
                  ) : (
                    <span className="text-center text-caption text-ink-muted">{JOIN_MODE_LABELS[plan.joinMode].label}</span>
                  )}
                  {plan.joinMode === "APPROVAL" && joinable ? <p className="text-center text-caption text-ink-muted">The team reviews each application.</p> : null}
                </div>
              </li>
            );
          })}
        </PlanGrid>
      )}
    </div>
  );
}
