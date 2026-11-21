"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertToOrganisationCardDesign } from "@/app/actions/card-design";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { AreaScopePicker, type AreaScopeItem } from "./AreaScopePicker";

type ScopeItem = { id: string; name: string; ownDesign: boolean; pending: boolean };
type Source = "role" | "area" | "plan" | "organisation" | "default";

/** The nearest area above `area` with an approved design of its own, if any. */
function liveAreaAbove(areas: AreaScopeItem[], area: AreaScopeItem) {
  const byId = new Map(areas.map((item) => [item.id, item]));
  for (let at = area.parentId ? byId.get(area.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) {
    if (at.live) return at;
  }
  return null;
}

/**
 * Which design the designer edits: the organisation's, one plan's own, one member role's own or one area's own.
 * A card uses its member's primary role design, else the nearest area design (the member's own area, then the
 * areas above it), else its plan's, else the organisation's. A scope without its own design starts from what its
 * cards use today; once the owner approves its draft, it has its own. Only the owner (`canRevert`) can send it back.
 */
export function DesignScopePicker({ slug, plans, roles, areas, planId, roleId, unitId, source, canRevert }: { slug: string; plans: ScopeItem[]; roles: ScopeItem[]; areas: AreaScopeItem[]; planId: string | null; roleId: string | null; unitId: string | null; source: Source; canRevert: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const base = `/dashboard/${slug}/settings/cards`;
  const chip = (key: string, href: string, name: string, current: boolean, own: boolean, pending = false) => (
    <Link
      key={key}
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3.5 text-[14px] transition-colors duration-(--sw-dur-fast)",
        current ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
      )}
    >
      {name}
      {own || pending ? <span className={cn("text-caption", current ? "text-on-primary" : "text-ink-muted")}>{pending ? "· waiting for approval" : "· own design"}</span> : null}
    </Link>
  );
  const area = unitId ? areas.find((item) => item.id === unitId) ?? null : null;
  const scoped = planId ? "plan" : roleId ? "role" : area ? "area" : null;
  // Roles and plans never inherit, so their source says whether they have their own; an area may use one above it.
  const own = scoped === "area" ? Boolean(area?.live) : scoped !== null && source === scoped;
  const above = area ? liveAreaAbove(areas, area) : null;
  const revert = () => startTransition(async () => {
    await revertToOrganisationCardDesign({ organisationSlug: slug, planId, roleId, unitId });
    router.refresh();
  });

  const inherited = () => {
    if (scoped === "plan") return "This plan's cards use the organisation design. Change anything below to draft one of its own; the owner approves it before cards change.";
    if (scoped === "role") return "Members with this primary role use the organisation design. Change anything below to draft the role's own design and card numbers; the owner approves them before cards change.";
    const from = source === "area" && above ? `the design of ${above.name} (${above.levelName})` : "the organisation design";
    return `Members in this area use ${from}. Change anything below to draft the area's own design and card numbers; the owner approves them before cards change.`;
  };
  const ownText = scoped === "plan"
    ? "This plan has its own card design."
    : scoped === "role"
      ? "This role has its own card design, used before any area or plan design."
      : "This area has its own card design, used for its members and the areas under it without their own, before any plan design.";

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Design for" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {chip("organisation", base, "Organisation design", !scoped, false)}
          {plans.map((plan) => chip(`plan-${plan.id}`, `${base}?plan=${plan.id}`, plan.name, plan.id === planId, plan.ownDesign, plan.pending))}
        </div>
        {roles.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-ink-muted">Member roles</span>
            {roles.map((role) => chip(`role-${role.id}`, `${base}?role=${role.id}`, role.name, role.id === roleId, role.ownDesign, role.pending))}
          </div>
        ) : null}
        {areas.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-ink-muted">Areas</span>
            <AreaScopePicker base={base} areas={areas} unitId={area?.id ?? null} />
          </div>
        ) : null}
      </nav>
      {scoped && !own ? <Callout tone="info">{inherited()}</Callout> : null}
      {scoped && own ? (
        <Callout
          tone="info"
          action={canRevert ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={revert}>
              {above ? `Use ${above.name}'s design` : "Use organisation design"}
            </Button>
          ) : undefined}
        >
          {ownText} Changes reach its cards once the owner approves them.
        </Callout>
      ) : null}
    </div>
  );
}
