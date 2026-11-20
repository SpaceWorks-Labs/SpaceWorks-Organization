import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent } from "hast";
import type { ReactNode } from "react";
import { extractHeadings } from "@/lib/docs/headings";
import { resolveDocHref } from "@/lib/docs/links";
import { remarkDocs } from "@/lib/docs/remarkDocs";
import { DocsCallout } from "./DocsCallout";
import { DocsCode } from "./DocsCode";
import { DocsHeading } from "./DocsHeading";
import { DocsImage, DocsScreenPair } from "./DocsImage";

const linkClass = "rounded-sm font-medium text-accent-text underline decoration-1 underline-offset-[3px] hover:decoration-2";

function textOf(node: ElementContent | Element): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

type Positioned = { node?: { position?: { start: { line: number } } }; children?: ReactNode };

/**
 * Renders one doc. No raw HTML is parsed; links and images are filtered; headings carry the ids the contents list
 * and the search index use; quotes starting with **Note**, **Tip** or **Warning** become callouts; a light and dark
 * screenshot pair shows the one matching the theme. `source` is the doc's repository path, for relative links.
 */
export function DocsMarkdown({ body, source }: { body: string; source: string }) {
  const ids = new Map(extractHeadings(body).map((heading) => [heading.line, heading.id]));
  const heading = (level: 2 | 3 | 4) =>
    function Heading({ node, children }: Positioned) {
      return <DocsHeading level={level} id={ids.get(node?.position?.start.line ?? 0)}>{children}</DocsHeading>;
    };

  const components: Components = {
    h1: ({ children }) => <h2 className="text-h2 mt-12 text-ink">{children}</h2>,
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    p: ({ node, children }) => {
      if (node?.properties?.dataScreenPair !== undefined) {
        const [light, dark] = node.children.filter((child): child is Element => child.type === "element");
        return <DocsScreenPair light={String(light?.properties?.src ?? "")} dark={String(dark?.properties?.src ?? "")} alt={String(light?.properties?.alt ?? "")} />;
      }
      return <p className="my-4">{children}</p>;
    },
    ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6 marker:text-ink-muted">{children}</ul>,
    ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6 marker:text-ink-muted">{children}</ol>,
    blockquote: ({ node, children }) => {
      const kind = node?.properties?.dataCallout;
      if (typeof kind === "string") return <DocsCallout kind={kind}>{children}</DocsCallout>;
      return <blockquote className="my-6 border-l-2 border-line-strong pl-5 text-ink-secondary">{children}</blockquote>;
    },
    hr: () => <hr className="my-10 border-line" />,
    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
    a: ({ href, children }) => {
      const safe = resolveDocHref(href, source);
      if (!safe) return <>{children}</>;
      if (safe.startsWith("/docs")) return <Link href={safe} className={linkClass}>{children}</Link>;
      if (safe.startsWith("#")) return <a href={safe} className={linkClass}>{children}</a>;
      return <a href={safe} className={linkClass} {...(/^https?:/.test(safe) ? { rel: "noopener noreferrer" } : {})}>{children}</a>;
    },
    img: ({ src, alt }) => <DocsImage src={typeof src === "string" ? src : undefined} alt={alt ?? ""} />,
    table: ({ children }) => (
      <div role="region" aria-label="Table" tabIndex={0} className="my-6 overflow-x-auto rounded-[12px] border border-line focus-visible:outline-2 focus-visible:outline-offset-2">
        <table className="text-label w-full border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-line bg-muted px-3.5 py-2.5 align-bottom font-semibold text-ink">{children}</th>,
    td: ({ children }) => <td className="border-b border-line px-3.5 py-2.5 align-top text-ink-secondary [overflow-wrap:anywhere] [tr:last-child_&]:border-b-0">{children}</td>,
    pre: ({ node }) => {
      const code = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
      const className = code?.properties?.className;
      const language = (Array.isArray(className) ? className : []).map(String).find((name) => name.startsWith("language-"))?.slice(9) ?? "";
      return <DocsCode language={language} code={code ? textOf(code).replace(/\n$/, "") : ""} />;
    },
    code: ({ children }) => <code className="code-text rounded-md border border-line bg-muted px-1.5 py-0.5 text-[0.875em] text-ink [overflow-wrap:anywhere]">{children}</code>,
  };

  return (
    <div className="text-body min-w-0 max-w-[75ch] text-ink-secondary [&>p:first-child]:text-body-l [&>p:first-child]:mt-0 [&>p:first-child]:text-ink-secondary">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDocs]} components={components}>{body}</ReactMarkdown>
    </div>
  );
}
