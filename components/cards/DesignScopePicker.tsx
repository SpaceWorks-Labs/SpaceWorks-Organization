"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertToOrganisationCardDesign } from "@/app/actions/card-design";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cn } from "@/lib/cn";

type ScopeItem = { id: string; name: string; ownDesign: boolean; pending: boolean };
type Source = "role" | "plan" | "organisation" | "default";

/**
 * Which design the designer edits: the organisation's, one plan's own or one member role's own. A card
 * uses its member's primary role design, else its plan's, else the organisation's. A plan or role
 * without its own design starts from the organisation's; once the owner approves its draft, it has its
 * own. Only the owner (`canRevert`) can send it back to the organisation design.
 */
export function DesignScopePicker({ slug, plans, roles, planId, roleId, source, canRevert }: { slug: string; plans: ScopeItem[]; roles: ScopeItem[]; planId: string | null; roleId: string | null; source: Source; canRevert: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const base = `/dashboard/${slug}/settings/cards`;
  const chip = (key: string, href: string, name: string, current: boolean, own: boolean, pending = false) => (
    <Link
      key={key}
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors duration-[120ms]",
        current ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
      )}
    >
      {name}
      {own || pending ? <span className={cn("text-caption", current ? "text-on-primary" : "text-ink-muted")}>{pending ? "· waiting for approval" : "· own design"}</span> : null}
    </Link>
  );
  const scoped = planId ? "plan" : roleId ? "role" : null;
  const ownName = scoped === "plan" ? "This plan" : "This role";
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Design for" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {chip("organisation", base, "Organisation design", !planId && !roleId, false)}
          {plans.map((plan) => chip(`plan-${plan.id}`, `${base}?plan=${plan.id}`, plan.name, plan.id === planId, plan.ownDesign, plan.pending))}
        </div>
        {roles.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-ink-muted">Member roles</span>
            {roles.map((role) => chip(`role-${role.id}`, `${base}?role=${role.id}`, role.name, role.id === roleId, role.ownDesign, role.pending))}
          </div>
        ) : null}
      </nav>
      {scoped && source !== scoped ? (
        <Callout tone="info">
          {scoped === "plan"
            ? "This plan's cards use the organisation design. Change anything below to draft one of its own; the owner approves it before cards change."
            : "Members with this primary role use the organisation design. Change anything below to draft the role's own design and card numbers; the owner approves them before cards change."}
        </Callout>
      ) : null}
      {scoped && source === scoped ? (
        <Callout
          tone="info"
          action={canRevert ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => startTransition(async () => { await revertToOrganisationCardDesign({ organisationSlug: slug, planId, roleId }); router.refresh(); })}>
              Use organisation design
            </Button>
          ) : undefined}
        >
          {ownName} has its own card design{scoped === "role" ? ", used before any plan design" : ""}. Changes reach its cards once the owner approves them.
        </Callout>
      ) : null}
    </div>
  );
}
