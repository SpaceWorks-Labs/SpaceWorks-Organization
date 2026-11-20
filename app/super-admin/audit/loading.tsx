import { BrandPageLoader } from "@/components/brand/BrandLoader";

// Not at app/super-admin: orgs/[orgId] and users/[userId] call notFound(), which must not stream a 200 first.
export default function Loading() {
  return <BrandPageLoader label="Loading the audit log" />;
}
