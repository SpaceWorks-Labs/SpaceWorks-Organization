import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadCollectionSheet } from "@/lib/views/app__dashboard__orgSlug__payments__collect__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { CollectionSheetForm } from "@/components/payments/CollectionSheetForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { Dropdown, Field } from "@/components/ui/field";

export const metadata: Metadata = { title: "Collection sheet", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ unit?: string }> };

export default async function CollectionSheetPage({ params, searchParams }: Props) {
  const view = await loadCollectionSheet({ params, searchParams });
  const { org } = view;
  const base = `/dashboard/${org.slug}/payments/collect`;
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/${org.slug}/payments`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Payments
      </Link>
      <OrgPageHeader
        organisation={org}
        title="Collection sheet"
        description={`Record fees collected in person for several members at once${view.unitName ? `, in ${view.unitName} and the units under it` : ""}.`}
      />

      {view.units.length ? (
        <form action={base} className="flex max-w-[560px] flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Unit" className="flex-1">
            <Dropdown name="unit" defaultValue={view.unitId}>
              {view.allowWholeOrganisation ? <option value="">Whole organisation</option> : null}
              {view.units.map((unit) => (
                <option key={unit.id} value={unit.id}>{`${" ".repeat(Math.max(0, unit.depth))}${unit.name} (${unit.levelName})`}</option>
              ))}
            </Dropdown>
          </Field>
          <button type="submit" className={buttonClasses({ variant: "secondary" })}>Show members</button>
        </form>
      ) : null}

      {view.makerChecker ? (
        <Callout tone="info" title="A second person confirms offline payments">
          Recorded rows wait for someone else on the team to confirm them. Receipt numbers are issued when they do.
        </Callout>
      ) : null}
      {view.truncated ? <Callout tone="warning">Showing the first 500 members who owe a fee. Choose a smaller unit to see the rest.</Callout> : null}

      {view.rows.length ? (
        <CollectionSheetForm key={view.unitId} slug={org.slug} rows={view.rows} today={view.today} maxRows={view.maxRows} makerChecker={view.makerChecker} />
      ) : (
        <EmptyState mood="sleepy" title="Nobody here owes a fee">Members waiting to pay show up here.</EmptyState>
      )}
    </div>
  );
}
