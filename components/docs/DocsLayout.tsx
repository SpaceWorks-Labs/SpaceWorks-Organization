import type { ReactNode } from "react";
import { DocsSidebar } from "./DocsSidebar";

/** Sidebar, article and (when given) the contents list. */
export function DocsLayout({ current, toc, children }: { current?: string; toc?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-8 pb-12 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
      <DocsSidebar {...(current ? { current } : {})} />
      <article className="min-w-0">{children}</article>
      {toc && <aside className="min-w-0 md:col-start-2 xl:col-start-3 xl:row-start-1">{toc}</aside>}
    </div>
  );
}
