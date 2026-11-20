import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DocHeading } from "@/lib/docs/headings";

function TocList({ headings }: { headings: DocHeading[] }) {
  return (
    <ol className="flex flex-col">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className={cn("text-label flex min-h-11 items-center rounded-sm py-1 text-ink-secondary transition-colors duration-(--sw-dur-fast) ease-sw hover:text-ink motion-reduce:transition-none", heading.level === 3 && "pl-4")}
          >
            {heading.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * "On this page": the doc's h2 and h3 headings, linked to their ids, hidden when there are fewer than two. A sticky
 * column on wide screens; `compact` is the disclosure shown above the article on narrower ones.
 */
export function DocsToc({ headings, compact = false }: { headings: DocHeading[]; compact?: boolean }) {
  const shown = headings.filter((heading) => heading.level <= 3);
  if (shown.length < 2) return null;
  if (compact) {
    return (
      <details className="group mb-8 rounded-xl border border-line xl:hidden">
        <summary className="text-label flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} aria-hidden="true" className="text-ink-muted transition-transform duration-(--sw-dur-fast) ease-sw group-open:rotate-90 motion-reduce:transition-none" />
          On this page
        </summary>
        <nav aria-label="On this page" className="border-t border-line px-4 py-2"><TocList headings={shown} /></nav>
      </details>
    );
  }
  return (
    <nav aria-labelledby="docs-toc-title" className="hidden flex-col gap-2 xl:sticky xl:top-[100px] xl:flex xl:max-h-[calc(100dvh-120px)] xl:self-start xl:overflow-y-auto">
      <h2 id="docs-toc-title" className="text-overline text-ink-muted">On this page</h2>
      <TocList headings={shown} />
    </nav>
  );
}
