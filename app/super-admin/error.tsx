"use client";

import { SegmentError, type RouteError } from "@/components/feedback/SegmentFallbacks";

export default function Error({ error, reset }: { error: RouteError; reset: () => void }) {
  return <SegmentError error={error} reset={reset} backHref="/super-admin" backLabel="Back to the overview" />;
}
