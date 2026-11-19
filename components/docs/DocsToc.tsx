import { cn } from "@/lib/cn";
import type { DocHeading } from "@/lib/docs/headings";

/** "On this page": the h2 and h3 headings of the doc, linked to their ids. */
export function DocsToc({ headings }: { headings: DocHeading[] }) {
  if (headings.length < 2) return null;
  return (
    <nav aria-label="On this page" className="flex flex-col gap-2.5 xl:sticky xl:top-[100px] xl:self-start">
      <p className="text-overline text-ink-muted">On this page</p>
      <ul className="flex flex-col">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className={cn("text-label flex min-h-11 items-center py-1 text-ink-secondary transition-colors duration-(--sw-dur-fast) ease-sw hover:text-ink", heading.level === 3 && "pl-4")}>{heading.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
