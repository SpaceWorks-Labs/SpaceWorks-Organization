"use client";

import { useParams } from "next/navigation";
import { SegmentNotFound } from "@/components/feedback/SegmentFallbacks";

export default function NotFound() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <SegmentNotFound
      title="We couldn’t find that page"
      body="The member, plan or payment may have been removed, or it may be outside the units you can see."
      backHref={`/dashboard/${orgSlug}`}
      backLabel="Back to the dashboard"
    />
  );
}
