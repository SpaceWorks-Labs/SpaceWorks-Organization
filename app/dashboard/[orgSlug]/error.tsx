"use client";

import { useParams } from "next/navigation";
import { SegmentError, type RouteError } from "@/components/feedback/SegmentFallbacks";

export default function Error({ error, reset }: { error: RouteError; reset: () => void }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return <SegmentError error={error} reset={reset} backHref={`/dashboard/${orgSlug}`} backLabel="Back to the dashboard" />;
}
