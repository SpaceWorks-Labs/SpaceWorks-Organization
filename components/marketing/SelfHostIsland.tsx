import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { GITHUB_URL, RELEASE_URL, RELEASE_VERSION, docsPath } from "@/lib/openSource";
import { DeployTabs } from "./DeployTabs";

/**
 * Self-hosting on the rounded Deep Ink island: dark on a light page, and back in the neutral black family on a
 * dark page (`.sw-dark-band`, CR-DARK-01), where a hairline keeps its shape.
 */
export function SelfHostIsland() {
  return (
    <section id="self-host" aria-labelledby="self-host-title" className="sw-land-wrap pt-8 lg:pt-12" data-reveal="">
      <div className="sw-dark-band sw-land-island grid gap-10 rounded-2xl border border-transparent bg-canvas px-5 py-8 text-ink dark:border-line dark:bg-surface md:rounded-3xl md:px-12 md:py-14 lg:gap-14 lg:px-16 lg:py-[72px]">
        <div className="sw-land-split">
          <div className="grid gap-4">
            <h2 id="self-host-title" className="sw-land-h2">Your server. Your members.</h2>
            <p className="text-label font-semibold text-ink-secondary">
              Latest release{" "}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">
                {RELEASE_VERSION}<span className="sr-only"> on GitHub (opens in a new tab)</span>
              </a>
            </p>
          </div>
          <div className="grid gap-5">
            <p className="sw-land-lede">
              The whole platform is open source. Run it for one organisation or every organisation in a federation, with one
              command on a Linux server, and update it the same way. Nobody else holds your members’ details or your books.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={docsPath("self-hosting")} className={buttonClasses({ variant: "inverse" })}>
                Read the install guide
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
                Source on GitHub
                <ArrowUpRight aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>
        </div>
        <DeployTabs />
      </div>
    </section>
  );
}
