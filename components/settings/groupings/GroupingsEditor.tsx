"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createOrgGrouping } from "@/app/actions/groupings";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, CardHeader, EmptyState } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { GroupingCard, type GroupingRow } from "./GroupingCard";

function NewGrouping({ slug }: { slug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"list" | "tree">("list");
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createOrgGrouping({ organisationSlug: slug, name, kind, multiple });
          if (!result.ok) return setError(result.error);
          setName("");
          router.refresh();
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Field label="Name" helperText="For example Profession, Region or Interest."><Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Shape" helperText="A tree has values under values.">
          <Dropdown value={kind} onChange={(event) => setKind(event.target.value as "list" | "tree")}>
            <option value="list">List</option>
            <option value="tree">Tree</option>
          </Dropdown>
        </Field>
      </div>
      <CheckboxField checked={multiple} onCheckedChange={(checked) => setMultiple(checked === true)} label="Members may hold several values" description="Otherwise each member holds one." />
      <div><Button type="submit" variant="primary" loading={pending} disabled={name.trim().length < 2}><Plus aria-hidden className="size-4" />Create grouping</Button></div>
    </form>
  );
}

/** Every grouping the organisation has, with its values, and a form to add another. */
export function GroupingsEditor({ slug, groupings, disabled }: { slug: string; groupings: GroupingRow[]; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {disabled ? <Callout tone="info">You can read the groupings, but your role can&apos;t change them.</Callout> : null}
      {groupings.length === 0 ? <EmptyState mood="sleepy">No groupings yet. Create one, then add a grouping question to a plan&apos;s join form.</EmptyState> : null}
      {groupings.map((grouping) => <GroupingCard key={grouping.id} slug={slug} grouping={grouping} disabled={disabled} />)}
      {!disabled ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="New grouping" description="Add the question to a plan under Plans, Join-form questions, then members pick a value when they join." />
          <NewGrouping slug={slug} />
        </Card>
      ) : null}
    </div>
  );
}
