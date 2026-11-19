import { loadLoginView } from "@/lib/views/app__auth__login__page";
import { Suspense } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { LoginForm } from "./ui";
import { BrandHomeLink } from "@/components/chrome/SiteHeader";
import { SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { BrandFacets } from "@/components/auth/BrandFacets";
import styles from "@/components/public/motion/motion.module.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** An illustrative membership card for the brand panel (product proof, not live data). */
function SampleCard({ name, plan, number, until, className }: { name: string; plan: string; number: string; until: string; className?: string }) {
  return (
    <div className={`flex w-full max-w-[340px] flex-col gap-4 rounded-xl bg-primary p-5 text-on-primary ${className ?? ""}`}>
      <span className="flex items-center justify-between gap-3">
        <span className="text-overline">Member</span>
        <span className="rounded-full bg-success-mark px-2.5 py-0.5 text-caption font-semibold text-on-success-mark">Valid</span>
      </span>
      <span className="flex flex-col">
        <span className="text-h4 text-on-primary">{name}</span>
        <span className="text-caption text-on-primary">{plan}</span>
      </span>
      <span className="flex items-end justify-between gap-3 text-caption">
        <span className="tabular-nums">{number}</span>
        <span>Valid until {until}</span>
      </span>
    </div>
  );
}

/** An illustrative renewal row for the brand panel. */
function SampleRow({ title, meta, className }: { title: string; meta: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3.5 rounded-xl border border-line bg-panel p-4 ${className ?? ""}`}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sw-sky text-label font-semibold text-sw-ink">AR</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label text-ink">{title}</span>
        <span className="truncate text-caption text-ink-muted">{meta}</span>
      </span>
    </div>
  );
}

export default async function LoginPage() {
  const { providers, singleSignOn, passwordEnabled, passkeyEnabled, phoneEnabled, accountCreationEnabled, emailAvailable } = await loadLoginView();
  return (
    <div className="grid min-h-dvh bg-canvas md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8 sm:py-6">
        <header>
          <BrandHomeLink />
        </header>
        {/* Anchored near the top rather than centred, so the heading stays put while the steps below it (two-step code,
            phone code) change height. */}
        <main id="main-content" tabIndex={-1} className="flex flex-1 justify-center py-10 focus:outline-none md:pt-[clamp(2.5rem,12dvh,7rem)]">
          <div className="flex w-full max-w-[400px] flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-display-l text-ink">Welcome back.</h1>
              <p className="text-body-ui text-ink-secondary">
                {!passwordEnabled ? "Choose how you would like to sign in." : providers.length || singleSignOn.length ? "Sign in with your email and password, or a linked account." : "Sign in with your email and password."}
                {accountCreationEnabled && passwordEnabled ? " New here? Create an account in seconds." : null}
              </p>
            </div>
            <Suspense fallback={<p className="text-body-ui text-ink-muted">Loading sign in…</p>}>
              <LoginForm accountCreationEnabled={accountCreationEnabled && passwordEnabled} providers={providers} singleSignOn={singleSignOn} passwordEnabled={passwordEnabled} emailAvailable={emailAvailable} passkeyEnabled={passkeyEnabled} phoneEnabled={phoneEnabled} />
            </Suspense>
            <p className="text-caption text-ink-muted">
              How we handle your account is in the <Link href="/privacy" className="font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">privacy notice</Link>.
            </p>
          </div>
        </main>
      </div>

      {/* Brand panel: the stacked lockup, the accent phrase and a few sample product objects (invented names). The box facets open and the
          objects rise once as the page loads (never on hover; still under reduced motion). */}
      <aside aria-hidden className="relative hidden overflow-hidden p-4 md:block">
        <div className="relative flex h-full flex-col justify-between gap-10 overflow-hidden rounded-xl bg-surface p-12">
          <BrandFacets size="sm" className="absolute -right-8 -top-6 lg:hidden" />
          <BrandFacets size="md" className="absolute -right-12 -top-10 hidden lg:block" />
          <SpaceWorksLogo variant="lockup-stacked" height={72} className="relative self-start" />
          <div className={`relative flex flex-col gap-4 py-6 ${styles.showcase}`}>
            <span className="absolute -right-16 -top-10 size-44 rounded-full bg-sw-citron" />
            <span className="absolute -bottom-2 right-20 size-20 rounded-xl bg-sw-sky" />
            <SampleCard name="Meera Nair" plan="Annual membership · Riverside Cycling Club" number="RCC-2026-0001" until="31 Mar 2027" className="relative -rotate-2" />
            <SampleRow title="Arjun Rao renewed for 2026–27" meta="₹1,200 · UPI · Receipt RCC/26-27/0002" className="relative ml-12 max-w-[340px] rotate-1" />
            <span className="relative ml-4 inline-flex items-center gap-2 self-start rounded-full bg-sw-citron px-4 py-2 text-label text-sw-ink">
              <Check className="size-4" />
              Priya Das approved
            </span>
          </div>
          <p className="relative flex items-end justify-between gap-6">
            <span className="font-accent text-[34px] font-medium leading-[1.1] text-ink">Members,<br />sorted.</span>
            <span className="size-14 shrink-0 rounded-tl-full bg-highlight" />
          </p>
        </div>
      </aside>
    </div>
  );
}
