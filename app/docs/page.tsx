import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Library, Rocket, Server, Users } from "lucide-react";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { DocsSearchButton } from "@/components/docs/DocsSearchButton";
import { DOC_SECTIONS, docsBySection, sectionHref, type DocSection } from "@/lib/docs/pages";
import { RELEASE_VERSION } from "@/lib/openSource";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Get started, learn each feature, find what your role can do, run Space Works Organization yourself and look things up.",
};

const ICONS: Record<DocSection, typeof BookOpen> = { start: Rocket, features: BookOpen, manuals: Users, running: Server, reference: Library };

/** Four ways in: the starting points most visitors want. */
const DOORS: { section: DocSection; title: string; body: string; href: string }[] = [
  { section: "start", title: "Get started", body: "Set up an organisation, join one, or install the platform.", href: "/docs/quickstart-owner" },
  { section: "manuals", title: "Your role", body: "What owners, managers, treasurers, members and super admins can do.", href: sectionHref("manuals") },
  { section: "running", title: "Host it", body: "One-line install, cloud and free routes, backups and updates.", href: "/docs/choose-your-hosting" },
  { section: "reference", title: "Look it up", body: "Audit actions, environment variables, limits and endpoints.", href: sectionHref("reference") },
];

const cardClass = "flex h-full min-h-11 flex-col gap-1.5 rounded-[16px] border border-line bg-panel p-4 transition-colors duration-(--sw-dur-fast) ease-sw hover:border-line-strong hover:bg-muted motion-reduce:transition-none";

/** The docs home: search, four doors, then every section with its pages. Public, no sign-in. */
export default function DocsIndexPage() {
  return (
    <DocsLayout>
      <header className="grid gap-5 pb-10">
        <span className="text-caption inline-flex min-h-6 w-fit items-center rounded-full bg-muted px-2.5 font-semibold tabular-nums text-ink">Version {RELEASE_VERSION}</span>
        <h1 className="text-display-m text-ink [text-wrap:balance]">Space Works Organization documentation</h1>
        <p className="text-body-l max-w-[65ch] text-ink-secondary">
          How to run memberships with it, what each role can do, and how to host it yourself. Written for owners, staff, members
          and the people who keep the server running.
        </p>
        <DocsSearchButton variant="hero" />
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {DOORS.map((door) => {
          const Icon = ICONS[door.section];
          return (
            <li key={door.title}>
              <Link href={door.href} className={cardClass}>
                <Icon size={22} aria-hidden="true" className="text-ink-muted" />
                <span className="text-title mt-1 flex items-center gap-2 text-ink">{door.title}<ArrowRight size={16} aria-hidden="true" /></span>
                <span className="text-label text-ink-secondary">{door.body}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {DOC_SECTIONS.map((section) => (
        <section key={section.key} id={section.key} aria-labelledby={`${section.key}-title`} className="mt-14 scroll-mt-[100px]">
          <h2 id={`${section.key}-title`} className="text-h2 text-ink">{section.title}</h2>
          <p className="text-body mt-2 max-w-[65ch] text-ink-secondary">{section.blurb}</p>
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {docsBySection(section.key).map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/${doc.slug}`} className={cardClass}>
                  <span className="text-title text-ink">{doc.title}</span>
                  <span className="text-label line-clamp-2 text-ink-secondary">{doc.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsLayout>
  );
}
