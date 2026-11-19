import type { Metadata } from "next";
import { SamlFinish } from "@/components/auth/SamlFinish";

export const metadata: Metadata = { title: "Signing in", robots: { index: false, follow: false } };

/** Where the SAML response lands: a small page that hands the one-time ticket in the URL fragment to Auth.js. */
export default function SamlFinishPage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-dvh items-center justify-center bg-canvas px-4 focus:outline-none">
      <SamlFinish />
    </main>
  );
}
