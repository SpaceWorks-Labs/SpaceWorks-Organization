import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { BridgeSignIn } from "@/components/auth/BridgeSignIn";
import { BrandHomeLink } from "@/components/chrome/SiteHeader";
import { loadBridgeView } from "@/lib/views/app__auth__login__bridge__provider__page";

export const metadata: Metadata = { title: "Continue sign-in", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Opens the Supabase or Firebase sign-in and finishes it here. The configuration is public by design. */
export default async function BridgePage({ params }: { params: Promise<{ provider: string }> }) {
  await connection();
  const view = await loadBridgeView((await params).provider);
  const name = view.provider === "supabase" ? "Supabase" : "Firebase";
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 py-5 sm:px-8 sm:py-6">
      <header>
        <BrandHomeLink />
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-[400px] flex-1 flex-col gap-6 py-10 focus:outline-none md:pt-[clamp(2.5rem,12dvh,7rem)]">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-l text-ink">Continue with {name}</h1>
          <p className="text-body-ui text-ink-secondary">Sign in with your {name} account. You come straight back here afterwards.</p>
        </div>
        {view.provider === "supabase" ? <BridgeSignIn provider="supabase" config={view.config} /> : <BridgeSignIn provider="firebase" config={view.config} />}
        <Link href="/login" className="inline-flex min-h-11 items-center self-center px-1 text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
