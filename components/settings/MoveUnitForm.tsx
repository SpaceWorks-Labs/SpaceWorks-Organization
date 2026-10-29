"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveUnit } from "@/app/actions/units";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field } from "@/components/ui/field";

/** Move a unit, and everything under it, to another unit on the level above. */
export function MoveUnitForm({ slug, unitId, parentLevelName, parents }: { slug: string; unitId: string; parentLevelName: string; parents: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [parentId, setParentId] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (parents.length === 0) return <p className="text-body-ui text-ink-secondary">There is no other {parentLevelName.toLowerCase()} to move it to.</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => {
          const outcome = await moveUnit({ organisationSlug: slug, unitId, parentId });
          setResult(outcome.ok ? { ok: true, message: "Moved. Its members and staff moved with it." } : { ok: false, message: outcome.error });
          if (outcome.ok) {
            setParentId("");
            router.refresh();
          }
        });
      }}
    >
      {result ? <Callout tone={result.ok ? "success" : "danger"} role={result.ok ? "status" : "alert"}>{result.message}</Callout> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={`New ${parentLevelName.toLowerCase()}`} className="flex-1">
          <Dropdown value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Choose…</option>
            {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
          </Dropdown>
        </Field>
        <Button type="submit" variant="secondary" loading={pending} disabled={!parentId}>Move</Button>
      </div>
    </form>
  );
}
