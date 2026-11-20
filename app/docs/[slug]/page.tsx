import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/DocArticle";
import { DOC_SLUGS, getDoc } from "@/lib/docs/pages";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = getDoc((await params).slug);
  return doc ? { title: `${doc.title} · Docs`, description: doc.summary } : {};
}

/** One doc. Unknown slugs are a 404. */
export default async function DocPage({ params }: Props) {
  const doc = getDoc((await params).slug);
  if (!doc) notFound();
  return <DocArticle doc={doc} />;
}
