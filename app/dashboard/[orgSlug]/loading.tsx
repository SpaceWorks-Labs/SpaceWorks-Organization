import { BrandPageLoader } from "@/components/brand/BrandLoader";

// Inside the organisation shell: the sidebar stays while a page under it loads. app/dashboard/loading.tsx already
// streams this subtree, so this adds no new 200-before-notFound() case.
export default function Loading() {
  return <BrandPageLoader label="Loading this page" />;
}
