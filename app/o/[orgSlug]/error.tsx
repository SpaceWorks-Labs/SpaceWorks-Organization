"use client";

import { useParams } from "next/navigation";
import { SegmentError, type RouteError } from "@/components/feedback/SegmentFallbacks";

export default function Error({ error, reset }: { error: RouteError; reset: () => void }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
      <SegmentError
        error={error}
        reset={reset}
        body="Try again. If it keeps happening, contact the organisation and share the support reference."
        backHref={`/o/${orgSlug}`}
        backLabel="Back to the organisation’s page"
      />
    </div>
  );
}
