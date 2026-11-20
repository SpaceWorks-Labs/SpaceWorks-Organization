"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroupingValue } from "@/app/actions/groupings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** A one-line form that adds a value to a grouping, at the top or under a parent value. */
export function AddValue({ slug, groupingId, parentId, label, onDone }: { slug: string; groupingId: string; parentId: string | null; label: string; onDone?: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createGroupingValue({ organisationSlug: slug, groupingId, parentId, label: text });
          if (!result.ok) return setError(result.error);
          setText("");
          router.refresh();
          onDone?.();
        });
      }}
    >
      <Field label={label} error={error ?? undefined} className="min-w-48 flex-1"><Input value={text} maxLength={80} onChange={(event) => setText(event.target.value)} /></Field>
      <Button type="submit" variant="secondary" loading={pending} disabled={!text.trim()}>Add value</Button>
      {onDone ? <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button> : null}
    </form>
  );
}
