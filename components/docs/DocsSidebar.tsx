import Link from "next/link";
import { cn } from "@/lib/cn";
import { docsBySection, SECTION_TITLES, type DocSection } from "@/lib/docs/pages";

const SECTIONS: DocSection[] = ["features", "operators"];

function DocsList({ current }: { current?: string }) {
  return (
    <ul className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <li key={section} className="flex flex-col gap-2">
          <p className="text-overline text-ink-muted">{SECTION_TITLES[section]}</p>
          <ul className="flex flex-col gap-0.5">
            {docsBySection(section).map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/docs/${doc.slug}`}
                  aria-current={doc.slug === current ? "page" : undefined}
                  className={cn("text-label flex min-h-11 items-center rounded-control px-3 py-2 transition-colors duration-(--sw-dur-fast) ease-sw", doc.slug === current ? "bg-muted font-semibold text-ink" : "text-ink-secondary hover:bg-muted hover:text-ink")}
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Every doc, grouped. A collapsible list on phones, a sticky column from the md breakpoint. */
export function DocsSidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation" className="md:sticky md:top-[100px] md:self-start">
      <details className="rounded-xl border border-line md:hidden">
        <summary className="text-label min-h-11 cursor-pointer px-4 py-3 font-semibold text-ink">All documentation</summary>
        <div className="border-t border-line p-3"><DocsList {...(current ? { current } : {})} /></div>
      </details>
      <div className="hidden md:block"><DocsList {...(current ? { current } : {})} /></div>
    </nav>
  );
}
