import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer } from "@tiptap/core";

export type CalloutVariant = "info" | "warning" | "tip";

function isCalloutVariant(value: unknown): value is CalloutVariant {
  return value === "info" || value === "warning" || value === "tip";
}

const calloutTokenizer: MarkdownTokenizer = {
  name: "callout",
  level: "block",
  start: (source) => source.search(/^>\s*\[!(?:INFO|WARNING|TIP)\]/im),
  tokenize: (source, _tokens, lexer): MarkdownToken | undefined => {
    const block = source.match(/^(?:>[^\n]*(?:\n|$))+/);
    if (!block) return undefined;
    const firstLine = block[0].split(/\r?\n/, 1)[0] ?? "";
    const marker = firstLine.match(/^>\s*\[!(INFO|WARNING|TIP)\]\s*(.*)$/i);
    if (!marker) return undefined;

    const lines = block[0].split(/\r?\n/).map((line) => line.replace(/^>\s?/, ""));
    lines.shift();
    if (marker[2]) lines.unshift(marker[2]);
    const content = lines.join("\n").replace(/\n+$/, "");
    return {
      type: "callout",
      raw: block[0],
      variant: marker[1].toLocaleLowerCase(),
      tokens: content ? lexer.blockTokens(content) : [],
    };
  },
};

function parseCallout(token: MarkdownToken, helpers: MarkdownParseHelpers) {
  const variant = isCalloutVariant(token.variant) ? token.variant : "info";
  return helpers.createNode("callout", { variant }, helpers.parseChildren(token.tokens ?? []));
}

function renderCallout(node: { attrs?: Record<string, unknown>; content?: MarkdownToken[] }, helpers: MarkdownRendererHelpers): string {
  const variant = isCalloutVariant(node.attrs?.variant) ? node.attrs.variant : "info";
  const content = helpers.renderChildren(node.content ?? []).trimEnd();
  const quotedContent = content
    ? content.split("\n").map((line) => line ? `> ${line}` : ">").join("\n")
    : ">";
  return `> [!${variant.toLocaleUpperCase()}]\n${quotedContent}`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-variant");
          return isCalloutVariant(value) ? value : "info";
        },
        renderHTML: (attributes: { variant?: unknown }) => ({
          "data-variant": isCalloutVariant(attributes.variant) ? attributes.variant : "info",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
  addCommands() {
    return {
      setCallout: (variant: CalloutVariant = "info") => ({ commands }) =>
        commands.wrapIn(this.name, { variant }),
    };
  },
  markdownTokenName: "callout",
  markdownTokenizer: calloutTokenizer,
  parseMarkdown: parseCallout,
  renderMarkdown: renderCallout,
});
