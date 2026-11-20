"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMemberGroupings } from "@/app/actions/member-groupings";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { GroupingPicker, type PickerGroupingView } from "./GroupingPicker";

/** The values a member holds in each grouping, set by staff. Hidden when the organisation has no groupings. */
export function MemberGroupingsPanel({ slug, memberId, groupings, initial, canManage }: {
  slug: string; memberId: string; groupings: PickerGroupingView[]; initial: Record<string, string[]>; canManage: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (!groupings.length) return null;
  const save = () => startTransition(async () => {
    setStatus(null);
    const result = await setMemberGroupings({ organisationSlug: slug, memberId, groupings: groupings.map((grouping) => ({ groupingId: grouping.id, valueIds: value[grouping.id] ?? [] })) });
    setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  });
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Groupings" description="The ways this organisation divides its members. Members choose some on the join form." />
      <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); save(); }}>
        {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
        <GroupingPicker groupings={groupings} value={value} disabled={!canManage} onChange={(id, ids) => setValue((current) => ({ ...current, [id]: ids }))} />
        {canManage ? <div><Button type="submit" variant="primary" loading={pending}>Save groupings</Button></div> : null}
      </form>
    </Card>
  );
}
