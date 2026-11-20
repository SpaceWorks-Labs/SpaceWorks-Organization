import { Link as LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const STYLES = {
  2: "text-h2 mt-14 border-t border-line pt-8",
  3: "text-h3 mt-10",
  4: "text-h4 mt-8",
} as const;

/** A doc heading with its id and a link to itself, shown on hover and focus (always faintly on touch screens). */
export function DocsHeading({ level, id, children }: { level: 2 | 3 | 4; id: string | undefined; children: ReactNode }) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={cn("group scroll-mt-[100px] text-ink [text-wrap:balance]", STYLES[level])}>
      {children}
      {id && (
        <a
          href={`#${id}`}
          className="ml-2 inline-flex size-11 items-center justify-center rounded-control align-middle text-ink-muted opacity-0 transition-opacity duration-(--sw-dur-fast) ease-sw hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-60 motion-reduce:transition-none"
        >
          <LinkIcon size={16} aria-hidden="true" />
          <span className="sr-only">Link to this section</span>
        </a>
      )}
    </Tag>
  );
}
