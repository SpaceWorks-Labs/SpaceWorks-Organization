import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { FeatureAreaSection } from "@/components/marketing/FeatureAreaSection";
import { FeatureIndex } from "@/components/marketing/FeatureIndex";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { FEATURE_AREAS } from "@/lib/features/catalog";
import { CAPABILITY_LIST, STARTER_ROLES } from "@/lib/permissionRoles";
import { DOCS_PATH, docsPath } from "@/lib/openSource";
import "@/components/marketing/landing.css";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Every area of Space Works Organization: organisations and units, staff roles, plans and join forms, renewals, payments, GST receipts, member cards, the member portal, reports, notifications and self-hosting.",
};

/** How the pieces fit: tenancy, units, roles and the platform view, each pointing at its area below. */
const PRINCIPLES = [
  { title: "Every organisation is its own tenant", body: "Members, money, team and settings stay inside it. A link into another organisation's records shows not found.", href: "#organisations" },
  { title: "Units in your own words", body: "Up to four levels you name, a tree of units, and unit codes in join links and card numbers.", href: "#units" },
  { title: "Staff see only their part", body: `Custom roles from ${CAPABILITY_LIST.length} permissions, held for the whole organisation or one unit, behind an authenticator.`, href: "#staff-and-roles" },
  { title: "One view of the platform", body: "The super admin reviews organisations, sets their limits and compares them in counts and totals, never member details.", href: "#reports-and-analytics" },
];

/**
 * /features: every area from the one catalogue (lib/features/catalog.ts), with an in-page index, each area's
 * anchor (#<id>) and its docs page. Public, and shown whether or not the landing page is switched on.
 */
export default function FeaturesPage() {
  const index = FEATURE_AREAS.map(({ id, title }) => ({ id, title }));
  return (
    <RevealRoot className="sw-land">
      <section aria-labelledby="features-title" className="sw-land-pattern sw-land-hero">
        <div className="sw-land-wrap grid gap-6">
          <h1 id="features-title" className="sw-land-title max-w-[18ch]">Everything it does, area by area.</h1>
          <p className="sw-land-hero-lede">
            Space Works Organization runs memberships for many organisations on one platform. Each area below says what it
            does, who can use it and how to switch it on or off, and links to its page in the docs.
          </p>
          <p className="text-label font-medium text-ink-muted">
            {FEATURE_AREAS.length} areas · {STARTER_ROLES.length} starter roles · {CAPABILITY_LIST.length} permissions
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={DOCS_PATH} className={buttonClasses({ variant: "primary", size: "lg" })}>
              Read the docs
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href={docsPath("self-hosting")} className={buttonClasses({ variant: "secondary", size: "lg" })}>Install on your server</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="fit-title" className="sw-land-wrap pb-16 lg:pb-24">
        <h2 id="fit-title" className="sr-only">How it fits together</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-reveal="">
          {PRINCIPLES.map((item) => (
            <li key={item.title}>
              <a href={item.href} className="grid h-full content-start gap-2 rounded-xl border border-line bg-surface p-5 transition-colors duration-(--sw-dur-fast) hover:border-line-strong hover:bg-muted">
                <span className="text-title text-ink">{item.title}</span>
                <span className="text-body-ui text-ink-muted">{item.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="sw-land-wrap grid gap-10 pb-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:pb-24">
        <aside>
          <FeatureIndex areas={index} />
        </aside>
        <div>
          {FEATURE_AREAS.map((area) => <FeatureAreaSection key={area.id} area={area} />)}
        </div>
      </div>

      <section aria-labelledby="features-close-title" className="sw-land-wrap pb-16 lg:pb-24" data-reveal="">
        <div className="grid gap-6 rounded-2xl border border-line bg-surface px-5 py-10 md:rounded-3xl md:px-12 md:py-14">
          <h2 id="features-close-title" className="sw-land-h2 max-w-[20ch]">Start with what you run today.</h2>
          <p className="sw-land-lede">Apply to run your organisation on this platform, or install it on your own server and add the rest when you need it.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/start" className={buttonClasses({ variant: "primary", size: "lg" })}>Apply for your organisation</Link>
            <Link href="/organisations" className={buttonClasses({ variant: "secondary", size: "lg" })}>Find an organisation</Link>
          </div>
        </div>
      </section>
    </RevealRoot>
  );
}
