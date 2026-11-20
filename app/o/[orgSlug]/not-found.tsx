"use client";

import { useParams } from "next/navigation";
import { SegmentNotFound } from "@/components/feedback/SegmentFallbacks";

export default function NotFound() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
      <SegmentNotFound
        title="We couldn’t find that page"
        body="The plan or page may have closed, or the link may be old."
        backHref={`/o/${orgSlug}`}
        backLabel="Back to the organisation’s page"
      />
    </div>
  );
}
