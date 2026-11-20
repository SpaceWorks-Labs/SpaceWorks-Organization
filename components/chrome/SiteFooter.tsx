"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SpaceWorksProductLogo } from "@/components/brand/SpaceWorksLogo";
import { ExternalLink, InstallCommand, PROJECT_LINKS } from "@/components/marketing/ProjectLinks";
import { PrivacyPreferencesLink } from "@/components/telemetry/PrivacyPreferencesLink";
import { DOCS_PATH, GITHUB_URL, LICENSE_URL, RELEASE_URL, RELEASE_VERSION, docsPath } from "@/lib/openSource";

type FooterLink = { label: string; href: string };

const productLinks: FooterLink[] = [
  { label: "Features", href: "/features" },
  { label: "Organisations", href: "/organisations" },
  { label: "Apply for your organisation", href: "/start" },
  { label: "About", href: "/about" },
];
const docsLinks: FooterLink[] = [
  { label: "All documentation", href: DOCS_PATH },
  { label: "Self-hosting", href: docsPath("self-hosting") },
  { label: "Organisations and units", href: docsPath("units") },
  { label: "Payments", href: docsPath("payments") },
  { label: "Member cards", href: docsPath("member-cards") },
];
const legalLinks: FooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const linkClasses =
  "inline-flex min-h-11 w-fit items-center gap-1 rounded-control text-body-ui text-ink-secondary underline-offset-4 transition-colors duration-(--sw-dur-fast) hover:text-ink hover:underline";
const creditLinkClasses = "underline underline-offset-4 hover:text-ink";

/** Who runs this instance, e.g. "Asha Menon, Systems Engineer". Inlined at build time; empty hides it. */
const HOSTED_BY = process.env.NEXT_PUBLIC_HOSTED_BY?.trim() ?? "";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={`Footer: ${title}`} className="grid content-start gap-1">
      <h2 className="mb-2 font-sans text-overline font-semibold text-ink-muted">{title}</h2>
      <ul className="grid gap-0.5">{children}</ul>
    </nav>
  );
}

/**
 * Space Works Organization site footer (product rules §12.1): the product, the docs and the project's own links
 * (GitHub, latest release, changelog, AGPL licence), the install command, and the AGPL source credit. The
 * Privacy preferences link (components/telemetry) renders only while the consent panel applies to the page;
 * `privacyLink` replaces it where a page needs its own.
 */
export function SiteFooter({ privacyLink }: { privacyLink?: ReactNode } = {}) {
  const pathname = usePathname();
  const { status } = useSession();
  const product = status === "authenticated" ? [{ label: "Dashboard", href: "/dashboard" }, { label: "Account", href: "/account" }, ...productLinks] : [...productLinks, { label: "Sign in", href: "/login" }];
  const internal = (link: FooterLink) => (
    <li key={link.href}>
      <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={linkClasses}>{link.label}</Link>
    </li>
  );

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-[1440px] gap-x-8 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-3 md:py-16 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] xl:px-8">
        <div className="grid content-start gap-5 md:col-span-3 xl:col-span-1">
          <Link href="/" className="inline-flex w-fit items-center rounded-md" aria-label="Space Works Organization home">
            <SpaceWorksProductLogo height={32} label={null} />
          </Link>
          <p className="max-w-sm text-body-ui text-ink-secondary">Open-source membership software for clubs, associations and federations.</p>
          <InstallCommand className="max-w-md" />
        </div>
        <Column title="Product">{product.map(internal)}</Column>
        <Column title="Docs">{docsLinks.map(internal)}</Column>
        <Column title="Project">
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} className={linkClasses}>{link.label}</ExternalLink>
            </li>
          ))}
          {legalLinks.map(internal)}
          <li>{privacyLink ?? <PrivacyPreferencesLink className={linkClasses} />}</li>
        </Column>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-caption text-ink-muted sm:px-6 xl:px-8">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <SourceCredit />
          </p>
          <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer" className={`code-text ${creditLinkClasses}`}>
            Version {RELEASE_VERSION}<span className="sr-only"> release notes on GitHub (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

/** "Powered by Space Works" plus the AGPL source link (the licence asks every install to offer its source). */
function SourceCredit() {
  return (
    <>
      {HOSTED_BY ? (
        <>
          <span>Hosted by {HOSTED_BY}</span>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>Powered by Space Works</span>
      <span aria-hidden>·</span>
      <span>
        Open source under{" "}
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={creditLinkClasses}>AGPL-3.0</a>
      </span>
      <span aria-hidden>·</span>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={creditLinkClasses}>Source code</a>
    </>
  );
}
