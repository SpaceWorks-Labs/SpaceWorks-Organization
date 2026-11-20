import { SegmentNotFound } from "@/components/feedback/SegmentFallbacks";

export default function NotFound() {
  return <SegmentNotFound title="We couldn’t find that page" body="It may have moved, or it isn’t linked to your account." backHref="/account" backLabel="Back to your account" />;
}
