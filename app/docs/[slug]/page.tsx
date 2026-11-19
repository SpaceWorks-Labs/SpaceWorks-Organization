import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { DocsMarkdown } from "@/components/docs/DocsMarkdown";
import { DocsToc } from "@/components/docs/DocsToc";
import { extractHeadings } from "@/lib/docs/headings";
import { DOC_SLUGS, getDoc } from "@/lib/docs/pages";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = getDoc((await params).slug);
  return doc ? { title: doc.title, description: doc.summary } : {};
}

/** One doc. Unknown slugs are a 404. */
export default async function DocPage({ params }: Props) {
  const doc = getDoc((await params).slug);
  if (!doc) notFound();
  return (
    <DocsLayout current={doc.slug} toc={<DocsToc headings={extractHeadings(doc.body)} />}>
      <DocsMarkdown body={doc.body} />
    </DocsLayout>
  );
}
