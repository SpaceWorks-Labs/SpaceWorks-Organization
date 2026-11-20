import type { ReactNode } from "react";
import { DocsSearchButton } from "./DocsSearchButton";
import { DocsSearchPalette } from "./DocsSearchPalette";
import { DocsSidebar } from "./DocsSidebar";

/** The search trigger above the sidebar, the article, and (when given) the contents column; one search palette. */
export function DocsLayout({ current, toc, children }: { current?: string; toc?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 pb-16 md:grid-cols-[248px_minmax(0,1fr)] md:gap-10 xl:grid-cols-[248px_minmax(0,1fr)_224px] xl:gap-12">
      <div className="flex min-w-0 flex-col gap-3 md:sticky md:top-[100px] md:self-start">
        <DocsSearchButton />
        <DocsSidebar {...(current ? { current } : {})} />
      </div>
      <div className="min-w-0">{children}</div>
      {toc && <aside className="hidden min-w-0 xl:block">{toc}</aside>}
      <DocsSearchPalette />
    </div>
  );
}
