import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { CHANGELOG_URL, LICENSE_URL, RELEASE_VERSION } from "@/lib/openSource";
import { ThemedShot } from "./ThemedShot";

/**
 * The opening: the product name and its promise, three ways in, then the staff console in the current theme.
 * The page's one Workshop Orange moment is "Apply for your organisation".
 */
export function HeroSection() {
  return (
    <>
      <section aria-labelledby="hero-title" className="sw-land-pattern sw-land-hero">
        <div className="sw-land-wrap grid justify-items-center gap-6 text-center md:gap-7">
          <a
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-info-mark px-4 text-caption font-semibold text-on-info-mark"
          >
            Release {RELEASE_VERSION}: see what changed
            <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <h1 id="hero-title" className="grid justify-items-center gap-4">
            <span className="font-sans text-h4 font-semibold tracking-normal text-accent-text">Space Works Organization</span>
            <span className="sw-land-title">Your members, in good standing.</span>
          </h1>
          <p className="sw-land-hero-lede">
            Free, open-source membership software for clubs, associations, alumni bodies and federations. Join forms and
            approvals, payments and GST receipts, member cards and renewals, on this platform or on your own server.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/start" className={buttonClasses({ variant: "highlight", size: "lg" })}>
              Apply for your organisation
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="#self-host" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Install on your server
            </Link>
            <Link href="/features" className={buttonClasses({ variant: "quiet", size: "lg" })}>
              See every feature
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <p className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-label font-medium text-ink-muted">
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Open source under AGPL-3.0<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {["Self-hosted or hosted here", "No licence fees"].map((fact) => (
              <span key={fact} className="inline-flex gap-x-2 whitespace-nowrap">
                <span aria-hidden>·</span>
                <span>{fact}</span>
              </span>
            ))}
          </p>
        </div>
      </section>
      <div className="sw-land-stage">
        <figure className="sw-land-wrap grid gap-3 pb-16 lg:pb-24">
          <ThemedShot name="members" eager alt="The members list in the staff dashboard: status filters, a search, and each member with their unit and membership." />
          <figcaption className="text-center text-caption text-ink-muted">The members list, with sample data. It follows your light or dark choice.</figcaption>
        </figure>
      </div>
    </>
  );
}
