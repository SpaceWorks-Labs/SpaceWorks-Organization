import { BrandPageLoader } from "@/components/brand/BrandLoader";

// Deliberately not at app/loading.tsx: a root Suspense boundary makes public
// pages stream a 200 before notFound()/redirect() run, which breaks real 404s.
// The box loader (LogoLoader) sits in the content area; the sidebar stays put.
export default function Loading() {
  return <BrandPageLoader label="Loading the dashboard" />;
}
