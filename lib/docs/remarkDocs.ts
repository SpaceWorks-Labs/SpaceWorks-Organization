import type { Blockquote, Image, Nodes, Paragraph, Parent, Root } from "mdast";

// One pass over a doc's parsed Markdown before it becomes React:
//   - "> **Note:** …", "> **Warning** …", "> **Tip:** …" and GitHub's "> [!NOTE]" quotes become callouts;
//   - a light screenshot followed by its dark twin (/screens/x-light.webp, /screens/x-dark.webp) becomes one
//     figure that shows the image matching the theme.

export const CALLOUT_KINDS = ["note", "tip", "important", "warning", "caution"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

function textOf(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "";
}

function calloutKind(word: string): CalloutKind | null {
  const value = word.toLowerCase().replace(/[:.!]$/, "").trim();
  if (value === "danger") return "caution";
  return (CALLOUT_KINDS as readonly string[]).includes(value) ? (value as CalloutKind) : null;
}

function markCallout(quote: Blockquote) {
  const first = quote.children[0];
  if (first?.type !== "paragraph" || !first.children.length) return;
  const lead = first.children[0];
  let kind: CalloutKind | null = null;
  if (lead.type === "strong") {
    kind = calloutKind(textOf(lead));
    if (kind) {
      first.children.shift();
      const after = first.children[0];
      if (after?.type === "text") after.value = after.value.replace(/^\s*:?\s*/, "");
    }
  } else if (lead.type === "text") {
    const alert = /^\[!(\w+)\]\s*/.exec(lead.value);
    kind = alert ? calloutKind(alert[1]) : null;
    if (kind && alert) lead.value = lead.value.slice(alert[0].length);
  }
  if (!kind) return;
  if (!first.children.length || textOf(first).trim() === "") quote.children.shift();
  quote.data = { ...quote.data, hProperties: { ...(quote.data?.hProperties ?? {}), dataCallout: kind } };
}

/** The image of a paragraph that holds only one image, else null. */
function loneImage(node: Nodes | undefined): Image | null {
  if (node?.type !== "paragraph") return null;
  const parts = (node as Paragraph).children.filter((child) => !(child.type === "text" && child.value.trim() === ""));
  return parts.length === 1 && parts[0].type === "image" ? parts[0] : null;
}

function pairScreens(parent: Parent) {
  const children = parent.children as Nodes[];
  for (let index = 0; index < children.length - 1; index++) {
    const light = loneImage(children[index]);
    const dark = loneImage(children[index + 1]);
    if (!light || !dark || !/-light\.\w+$/.test(light.url) || dark.url !== light.url.replace(/-light(\.\w+)$/, "-dark$1")) continue;
    const pair: Paragraph = { type: "paragraph", children: [light, dark], data: { hProperties: { dataScreenPair: "" } } };
    children.splice(index, 2, pair);
  }
}

export function remarkDocs() {
  return (tree: Root) => {
    const visit = (node: Nodes) => {
      if (node.type === "blockquote") markCallout(node);
      if ("children" in node) {
        pairScreens(node as Parent);
        for (const child of node.children as Nodes[]) visit(child);
      }
    };
    visit(tree);
  };
}
