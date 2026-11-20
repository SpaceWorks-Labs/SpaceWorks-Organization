import Link from "next/link";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { extractHeadings } from "@/lib/docs/headings";
import { editUrl, neighbours, SECTION_TITLES, sectionHref, type DocEntry } from "@/lib/docs/pages";
import { RELEASE_VERSION } from "@/lib/openSource";
import { DocsLayout } from "./DocsLayout";
import { DocsMarkdown } from "./DocsMarkdown";
import { DocsToc } from "./DocsToc";

const pagerClass = "grid min-h-11 gap-1 rounded-[16px] border border-line p-4 transition-colors duration-(--sw-dur-fast) ease-sw hover:border-line-strong hover:bg-muted motion-reduce:transition-none";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

/** Breadcrumb, title, meta (version, last update, edit link), the body with its contents, then previous and next. */
export function DocArticle({ doc }: { doc: DocEntry }) {
  const headings = extractHeadings(doc.body);
  const { previous, next } = neighbours(doc.slug);
  const edit = editUrl(doc);
  return (
    <DocsLayout current={doc.slug} toc={<DocsToc headings={headings} />}>
      <article aria-labelledby="doc-title" className="min-w-0 max-w-[75ch]">
        <nav aria-label="Breadcrumb" className="text-label mb-4 text-ink-muted">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/docs" className="rounded-sm hover:text-ink hover:underline">Docs</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href={sectionHref(doc.section)} className="rounded-sm hover:text-ink hover:underline">{SECTION_TITLES[doc.section]}</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink">{doc.title}</li>
          </ol>
        </nav>
        <h1 id="doc-title" className="text-display-m text-ink [text-wrap:balance]">{doc.title}</h1>
        <div className="text-label mb-8 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-5 text-ink-muted">
          <span className="text-caption inline-flex min-h-6 items-center rounded-full bg-muted px-2.5 font-semibold tabular-nums text-ink">Version {RELEASE_VERSION}</span>
          {doc.updated && <span>Updated <time dateTime={doc.updated}>{formatDate(doc.updated)}</time></span>}
          {doc.generated && <span>Generated from the code</span>}
          {edit && (
            <a href={edit} rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-accent-text hover:underline">
              <Pencil size={14} aria-hidden="true" />Edit this page on GitHub
            </a>
          )}
        </div>
        <DocsToc headings={headings} compact />
        <DocsMarkdown body={doc.body} source={doc.source} />
        {(previous || next) && (
          <nav aria-label="Previous and next pages" className="mt-16 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
            {previous ? (
              <Link href={`/docs/${previous.slug}`} rel="prev" className={pagerClass}>
                <span className="text-label flex items-center gap-1 text-ink-muted"><ArrowLeft size={14} aria-hidden="true" />Previous</span>
                <span className="font-semibold text-ink">{previous.title}</span>
              </Link>
            ) : <span className="hidden sm:block" />}
            {next && (
              <Link href={`/docs/${next.slug}`} rel="next" className={`${pagerClass} sm:text-right`}>
                <span className="text-label flex items-center gap-1 text-ink-muted sm:justify-end">Next<ArrowRight size={14} aria-hidden="true" /></span>
                <span className="font-semibold text-ink">{next.title}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
    </DocsLayout>
  );
}
