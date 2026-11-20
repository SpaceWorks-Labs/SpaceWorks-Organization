"use client";

import Link from "next/link";
import { MAX_STATS } from "@/lib/publicPage/sections";
import { MIN_PUBLIC_COUNT } from "@/lib/publicPage/live";
import { SwitchRow } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ItemList, type FieldContext, type SectionProps } from "./shared";

/** The introduction above a live list (plans or units). */
export function IntroFields({ intro, disabled, error, onIntro, note }: Pick<FieldContext, "disabled" | "error"> & { intro: string; onIntro: (intro: string) => void; note: string }) {
  return (
    <Field label="Introduction" optional helperText={note} error={error("intro")}>
      <Textarea value={intro} rows={2} maxLength={600} disabled={disabled} onChange={(event) => onIntro(event.target.value)} />
    </Field>
  );
}

/** Live counts: aggregates only, chosen one by one, with small numbers hidden. */
export function CountsFields({ section, disabled, error, onChange }: SectionProps<"counts">) {
  return (
    <div className="flex flex-col gap-4">
      <IntroFields intro={section.intro} disabled={disabled} error={error} onIntro={(intro) => onChange({ ...section, intro })} note="A line above the numbers." />
      <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-4" disabled={disabled}>
        <legend className="px-1 text-label font-semibold text-ink">Show</legend>
        <SwitchRow label="Members in total" description="Everyone with a current membership, including those in their grace period." checked={section.total} onCheckedChange={(total) => onChange({ ...section, total })} />
        <SwitchRow label="Members by plan" checked={section.byPlan} onCheckedChange={(byPlan) => onChange({ ...section, byPlan })} />
        <SwitchRow label="Members by unit" description="Counted by your top-level units." checked={section.byUnit} onCheckedChange={(byUnit) => onChange({ ...section, byUnit })} />
        {error("total") ? <p className="text-caption text-danger-fg">{error("total")}</p> : null}
      </fieldset>
      <p className="text-caption text-ink-muted">
        Counts update every few minutes. Only numbers are shown, never names. Any count under {MIN_PUBLIC_COUNT} is hidden so nobody can be picked out,
        and when one row is hidden the next smallest is hidden too. With fewer than {MIN_PUBLIC_COUNT} members, visitors don&apos;t see this section.
      </p>
    </div>
  );
}

/** The member card showcase: the approved card design drawn with a fictional sample name. */
export function CardFields({ section, slug, disabled, error, onChange }: SectionProps<"card">) {
  return (
    <div className="flex flex-col gap-4">
      <IntroFields intro={section.intro} disabled={disabled} error={error} onIntro={(intro) => onChange({ ...section, intro })} note="A line beside the card." />
      <p className="text-caption text-ink-muted">
        Shows your approved card design with a fictional sample name and number, never a real member. Change the design in{" "}
        <Link href={`/dashboard/${slug}/settings/cards`} className="text-accent-text underline underline-offset-4 hover:text-ink">Settings → Cards</Link>.
      </p>
    </div>
  );
}

/** Numbers you type in yourself (years running, events a year). */
export function StatsFields({ section, disabled, error, onChange }: SectionProps<"stats">) {
  return (
    <ItemList
      items={section.items}
      max={MAX_STATS}
      noun="number"
      addLabel="Add a number"
      empty="No numbers yet. Add things like years running or events a year."
      disabled={disabled}
      create={() => ({ value: "", label: "" })}
      onChange={(items) => onChange({ ...section, items })}
    >
      {(item, index, set) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Number" error={error(`items.${index}.value`)}>
            <Input value={item.value} maxLength={16} placeholder="25+" disabled={disabled} onChange={(event) => set({ value: event.target.value })} />
          </Field>
          <Field label="What it counts" error={error(`items.${index}.label`)}>
            <Input value={item.label} maxLength={60} placeholder="Years running" disabled={disabled} onChange={(event) => set({ label: event.target.value })} />
          </Field>
        </div>
      )}
    </ItemList>
  );
}
