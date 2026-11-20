import { SegmentNotFound } from "@/components/feedback/SegmentFallbacks";

export default function NotFound() {
  return <SegmentNotFound title="We couldn’t find that page" body="The organisation, person or page may have been removed, or the link is old." backHref="/super-admin" backLabel="Back to the overview" />;
}
