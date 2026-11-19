import Link from "next/link";
import type { Metadata } from "next";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { docsBySection, SECTION_TITLES, type DocSection } from "@/lib/docs/pages";

export const metadata: Metadata = {
  title: "Documentation",
  description: "What each part of Space Works Organization does, who can use it, and how to run it yourself.",
};

const SECTIONS: DocSection[] = ["features", "operators"];

/** Public documentation index. No sign-in. */
export default function DocsIndexPage() {
  return (
    <DocsLayout>
      <h1 className="text-display-m text-ink">Documentation</h1>
      <p className="text-body-l mt-3 max-w-[70ch] text-ink-secondary">What each part of Space Works Organization does, who can use it, and how to run it yourself.</p>
      {SECTIONS.map((section) => (
        <section key={section} aria-labelledby={`docs-${section}`} className="mt-10">
          <h2 id={`docs-${section}`} className="text-h2 text-ink">{SECTION_TITLES[section]}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {docsBySection(section).map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/${doc.slug}`} className="flex h-full flex-col gap-1 rounded-[16px] border border-line bg-panel p-4 hover:border-line-strong">
                  <span className="text-title text-ink">{doc.title}</span>
                  <span className="text-label text-ink-muted">{doc.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsLayout>
  );
}
