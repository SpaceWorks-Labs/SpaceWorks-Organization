import { BrandPageLoader } from "@/components/brand/BrandLoader";

// A nested segment, not app/account: memberships/[orgSlug] and pay/[termId] call notFound(), which must not stream a 200 first.
export default function Loading() {
  return <BrandPageLoader label="Loading your security settings" />;
}
