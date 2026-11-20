import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { DOC_SECTIONS, docsBySection, getDoc } from "@/lib/docs/pages";

const linkClass = "text-label flex min-h-11 items-center rounded-control px-3 py-2 transition-colors duration-(--sw-dur-fast) ease-sw motion-reduce:transition-none";

/** Sections as native disclosure groups: the one holding the current page starts open (all of them on the home). */
function DocsList({ current }: { current?: string }) {
  const holder = current ? getDoc(current)?.section : undefined;
  return (
    <div className="flex flex-col gap-1">
      <Link href="/docs" aria-current={current ? undefined : "page"} className={cn(linkClass, "font-semibold", current ? "text-ink hover:bg-muted" : "bg-muted text-ink")}>
        Overview
      </Link>
      {DOC_SECTIONS.map((section) => {
        const pages = docsBySection(section.key);
        return (
          <details key={section.key} open={!holder || holder === section.key} className="group">
            <summary className="text-label flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-2 font-semibold text-ink hover:bg-muted [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-muted transition-transform duration-(--sw-dur-fast) ease-sw group-open:rotate-90 motion-reduce:transition-none" />
              <span className="min-w-0 flex-1">{section.title}</span>
              <span className="text-caption tabular-nums text-ink-muted">{pages.length}</span>
            </summary>
            <ul className="mb-2 ml-[17px] flex flex-col gap-0.5 border-l border-line pl-2">
              {pages.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/docs/${doc.slug}`}
                    aria-current={doc.slug === current ? "page" : undefined}
                    className={cn(linkClass, doc.slug === current ? "bg-muted font-semibold text-ink" : "text-ink-secondary hover:bg-muted hover:text-ink")}
                  >
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

/** Every doc, grouped like the home page. One "Browse docs" disclosure on phones, a sticky scrolling column from md. */
export function DocsSidebar({ current }: { current?: string }) {
  const list = <DocsList {...(current ? { current } : {})} />;
  return (
    <nav aria-label="Documentation" className="md:sticky md:top-[100px] md:max-h-[calc(100dvh-120px)] md:self-start md:overflow-y-auto md:pr-1">
      <details className="group/browse rounded-xl border border-line md:hidden">
        <summary className="text-label flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} aria-hidden="true" className="text-ink-muted transition-transform duration-(--sw-dur-fast) ease-sw group-open/browse:rotate-90 motion-reduce:transition-none" />
          Browse docs
        </summary>
        <div className="border-t border-line p-2">{list}</div>
      </details>
      <div className="hidden md:block">{list}</div>
    </nav>
  );
}
