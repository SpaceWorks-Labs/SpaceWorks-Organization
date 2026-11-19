import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { extractHeadings } from "@/lib/docs/headings";
import { resolveDocHref, resolveDocImage } from "@/lib/docs/links";
import { screenExists } from "@/lib/docs/pages";

const linkClass = "text-accent-text underline underline-offset-2 hover:text-ink";

/** Renders one doc. No raw HTML is parsed, links and images are filtered, and headings carry the ids the contents list uses. */
export function DocsMarkdown({ body }: { body: string }) {
  const ids = new Map(extractHeadings(body).map((heading) => [heading.line, heading.id]));
  const heading = (Tag: "h2" | "h3", className: string) =>
    function Heading({ node, children }: { node?: { position?: { start: { line: number } } }; children?: ReactNode }) {
      return <Tag id={ids.get(node?.position?.start.line ?? 0)} className={className}>{children}</Tag>;
    };

  const components: Components = {
    h1: ({ children }) => <h1 className="text-h1 text-ink">{children}</h1>,
    h2: heading("h2", "text-h2 mt-12 scroll-mt-[100px] border-t border-line pt-8 text-ink"),
    h3: heading("h3", "text-h3 mt-8 scroll-mt-[100px] text-ink"),
    h4: ({ children }) => <h4 className="text-h4 mt-6 text-ink">{children}</h4>,
    p: ({ children }) => <p className="text-body my-4 text-ink-secondary">{children}</p>,
    ul: ({ children }) => <ul className="text-body my-4 list-disc space-y-2 pl-6 text-ink-secondary">{children}</ul>,
    ol: ({ children }) => <ol className="text-body my-4 list-decimal space-y-2 pl-6 text-ink-secondary">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="my-4 rounded-2xl bg-surface px-5 py-4 text-ink-secondary">{children}</blockquote>,
    hr: () => <hr className="my-8 border-line" />,
    strong: ({ children }) => <strong className="text-ink">{children}</strong>,
    a: ({ href, children }) => {
      const safe = resolveDocHref(href);
      if (!safe) return <>{children}</>;
      if (safe.startsWith("#")) return <a href={safe} className={linkClass}>{children}</a>;
      if (safe.startsWith("/docs/")) return <Link href={safe} className={linkClass}>{children}</Link>;
      return <a href={safe} className={linkClass} {...(/^https?:/.test(safe) ? { rel: "noopener noreferrer" } : {})}>{children}</a>;
    },
    img: ({ src, alt }) => {
      const safe = resolveDocImage(typeof src === "string" ? src : undefined);
      if (!safe) return null;
      const label = alt ?? "";
      const shown = !safe.startsWith("/screens/") || screenExists(safe);
      return (
        <figure className="my-6">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safe} alt={label} loading="lazy" className="h-auto max-w-full rounded-[16px] border border-line" />
          ) : (
            <div role="img" aria-label={label} className="text-label flex min-h-32 items-center justify-center rounded-[16px] border border-dashed border-line-strong bg-muted p-6 text-center text-ink-muted">
              Screenshot to come: {label}
            </div>
          )}
          {label && shown && <figcaption className="text-caption mt-2 text-ink-muted">{label}</figcaption>}
        </figure>
      );
    },
    table: ({ children }) => (
      <div className="my-6 overflow-x-auto rounded-[12px] border border-line">
        <table className="text-label w-full min-w-[32rem] border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-line bg-muted px-3 py-2 font-semibold text-ink">{children}</th>,
    td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top text-ink-secondary">{children}</td>,
    pre: ({ children }) => <pre className="code-text my-4 overflow-x-auto rounded-[12px] border border-line bg-muted p-4 text-ink">{children}</pre>,
    code: ({ className, children }) =>
      className?.startsWith("language-") ? (
        <code className={className}>{children}</code>
      ) : (
        <code className="code-text rounded bg-muted px-1.5 py-0.5 text-ink [overflow-wrap:anywhere]">{children}</code>
      ),
  };

  return (
    <div className="min-w-0 max-w-[70ch]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{body}</ReactMarkdown>
    </div>
  );
}
