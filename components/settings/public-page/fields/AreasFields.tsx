"use client";

import Link from "next/link";
import { areasForSection } from "@/lib/publicPage/blockData";
import { SwitchRow } from "@/components/ui/choice";
import { Dropdown, Field } from "@/components/ui/field";
import { ChoiceCards, type SectionProps } from "./shared";
import { IntroFields } from "./MembershipFields";

const SCOPES = [
  { value: "level", label: "One level below", description: "Only the areas directly under where you start." },
  { value: "subtree", label: "Everything below", description: "Every area under where you start, at any level." },
] as const;

/**
 * The areas directory: where it starts (the top level or one area), how deep it goes, and what each card shows. On
 * an area's own page, "Top level" lists that area's sub-areas instead.
 */
export function AreasFields({ section, slug, plans, disabled, error, extras, onChange }: SectionProps<"areas">) {
  const { areas, unitLevels } = extras;
  const listed = areasForSection(section, areas, null).length;
  const levelName = (level: number) => unitLevels[level] || "area";
  const missing = section.parentCode && !areas.some((area) => area.code === section.parentCode);

  return (
    <div className="flex flex-col gap-4">
      <IntroFields intro={section.intro} disabled={disabled} error={error} onIntro={(intro) => onChange({ ...section, intro })} note="A line above the areas." />
      {areas.length ? (
        <>
          <Field
            label="Start from"
            helperText="On an area's own page, the top level lists that area's sub-areas."
            error={error("parentCode") ?? (missing ? "That area is archived or gone. Choose another." : undefined)}
          >
            <Dropdown value={section.parentCode} disabled={disabled} onChange={(event) => onChange({ ...section, parentCode: event.target.value })}>
              <option value="">Top level</option>
              {missing ? <option value={section.parentCode} disabled>{section.parentCode} (not found)</option> : null}
              {areas.map((area) => (
                <option key={area.id} value={area.code}>{`${"  ".repeat(area.level)}${area.name} (${area.levelLabel || levelName(area.level)})`}</option>
              ))}
            </Dropdown>
          </Field>
          <ChoiceCards label="Which areas" value={section.scope} options={SCOPES} disabled={disabled} onChange={(scope) => onChange({ ...section, scope })} />
          <p className="text-caption text-ink-secondary">
            {listed ? `This lists ${listed} ${listed === 1 ? "area" : "areas"} on your organisation page.` : "No areas to list from here. Choose another place to start."}
          </p>
        </>
      ) : (
        <p className="text-body-ui text-ink-muted">
          You have no areas yet. Add them in{" "}
          <Link href={`/dashboard/${slug}/settings/structure`} className="text-accent-text underline underline-offset-4 hover:text-ink">Settings → Units and roles</Link>.
        </p>
      )}
      <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-4" disabled={disabled}>
        <legend className="px-1 text-label font-semibold text-ink">On each area</legend>
        <SwitchRow label="Contact details" description="Its email, phone and website, or the nearest ones above it." checked={section.showContact} onCheckedChange={(showContact) => onChange({ ...section, showContact })} />
        <SwitchRow label="Join link" description="Opens the join form with the area already chosen." checked={section.showJoinLink} onCheckedChange={(showJoinLink) => onChange({ ...section, showJoinLink })} />
      </fieldset>
      {section.showJoinLink ? (
        <Field label="Join link goes to" helperText="If the area doesn't offer that plan, the link uses the first open plan it does offer." error={error("joinPlanSlug")}>
          <Dropdown value={section.joinPlanSlug} disabled={disabled} onChange={(event) => onChange({ ...section, joinPlanSlug: event.target.value })}>
            <option value="">First open plan the area offers</option>
            {plans.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}
          </Dropdown>
        </Field>
      ) : null}
    </div>
  );
}
