import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Suggestion } from "@tiptap/suggestion";
import { db } from "@/lib/db/dexie";
import { createSuggestionRenderer, type MenuItem } from "../components/SlashCommandMenu";

interface WikilinkItem extends MenuItem {
  id: string | null;
  title: string;
  create?: boolean;
}

const wikilinkSuggestionKey = new PluginKey("wikilinkSuggestion");
const renderer = createSuggestionRenderer<WikilinkItem>(wikilinkSuggestionKey);

export const Wikilink = Extension.create({
  name: "wikilink",

  addProseMirrorPlugins() {
    return [
      Suggestion<WikilinkItem, WikilinkItem>({
        pluginKey: wikilinkSuggestionKey,
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: [" ", "\n", "("],
        allow: ({ state, range }) => !state.doc.textBetween(range.from, range.to).includes("]]"),
        items: async ({ query, signal }) => {
          try {
            const normalized = query.trim().toLocaleLowerCase();
            const notes = await db.notes.toArray();
            if (signal.aborted) return [];
            const matches = notes
              .filter((note) => note.title.toLocaleLowerCase().includes(normalized))
              .slice(0, 7)
              .map((note) => ({ id: note.id, title: note.title, label: note.title }));
            if (!normalized || matches.some((item) => item.title.toLocaleLowerCase() === normalized)) return matches;
            return [
              ...matches,
              { id: null, title: query.trim(), label: `+ Créer « ${query.trim()} »`, description: "Nouvelle note", create: true },
            ];
          } catch {
            window.dispatchEvent(new CustomEvent("pkm:wikilink-error"));
            return [];
          }
        },
        command: ({ editor, range, props }) => {
          if (props.create) {
            window.dispatchEvent(new CustomEvent<string>("pkm:create-wikilink", { detail: props.title }));
          }
          editor.chain().focus().deleteRange(range).insertContent(`[[${props.title}]]`).run();
        },
        render: renderer.render,
      }),
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || node.marks.some((mark) => mark.type.name === "code")) return;
              const expression = /\[\[([^\]]+)\]\]/g;
              let match: RegExpExecArray | null;
              while ((match = expression.exec(node.text ?? "")) !== null) {
                decorations.push(Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                  class: "wikilink",
                  "data-wikilink": match[1],
                }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
