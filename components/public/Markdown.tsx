import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type MarkdownInline } from "@/lib/publicPage/markdown";

function inline(nodes: MarkdownInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text": return <Fragment key={index}>{node.value}</Fragment>;
      case "break": return <br key={index} />;
      case "code": return <code key={index} className="rounded-sm bg-surface px-1 code-text text-[0.9em]">{node.value}</code>;
      case "strong": return <strong key={index} className="font-semibold text-ink">{inline(node.children)}</strong>;
      case "em": return <em key={index}>{inline(node.children)}</em>;
      case "link": {
        const external = /^https?:/i.test(node.href);
        return (
          <a key={index} href={node.href} className="text-accent-text underline underline-offset-4 hover:text-ink" {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}>
            {inline(node.children)}
          </a>
        );
      }
    }
  });
}

/**
 * Organisation-written Markdown, rendered from a parsed tree as React text nodes: no HTML string is ever
 * injected, so nothing a page author types can run script or escape its styles.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={className ?? "flex flex-col gap-4 text-body-l text-ink-secondary"}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": return block.level === 3
            ? <h3 key={index} className="text-h3 text-ink">{inline(block.children)}</h3>
            : <h4 key={index} className="text-h4 text-ink">{inline(block.children)}</h4>;
          case "paragraph": return <p key={index}>{inline(block.children)}</p>;
          case "quote": return <blockquote key={index} className="border-l border-line-strong pl-4 text-ink">{inline(block.children)}</blockquote>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index} className={`flex flex-col gap-1.5 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
