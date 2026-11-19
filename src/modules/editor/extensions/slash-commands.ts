import { Extension, type Editor } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { createSuggestionRenderer, type MenuItem } from "../components/SlashCommandMenu";
import { insertEditorBlock } from "../utils/insert-block";
import { aiService } from "@/modules/ai-copilot/services/ai-service";

interface SlashItem extends MenuItem {
  id: string;
  aiInstruction?: "structure" | "rewrite" | "continue";
  run: (editor: Editor) => void;
}

const commands: SlashItem[] = [
  { id: "h1", label: "Titre 1", description: "Grand titre", run: (editor) => { editor.chain().focus().toggleHeading({ level: 1 }).run(); } },
  { id: "h2", label: "Titre 2", description: "Titre de section", run: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
  { id: "h3", label: "Titre 3", description: "Petit titre", run: (editor) => { editor.chain().focus().toggleHeading({ level: 3 }).run(); } },
  { id: "bullet", label: "Liste à puces", run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
  { id: "ordered", label: "Liste numérotée", run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
  { id: "task", label: "Liste de tâches", run: (editor) => { editor.chain().focus().toggleTaskList().run(); } },
  { id: "table", label: "Tableau (3x3)", description: "Insérer une grille", run: (editor) => { insertEditorBlock(editor, "table"); } },
  { id: "quote", label: "Citation", run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
  { id: "callout", label: "Encart / Callout", description: "Insérer un encart informatif", run: (editor) => { insertEditorBlock(editor, "callout"); } },
  { id: "code", label: "Bloc de code", run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
  { id: "rule", label: "Séparateur", run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
  { id: "ai-structure", label: "✦ Structurer en plan", aiInstruction: "structure", run: (editor) => dispatchAITransform(editor, "structure") },
  { id: "ai-rewrite", label: "✦ Reformuler / Corriger", aiInstruction: "rewrite", run: (editor) => dispatchAITransform(editor, "rewrite") },
  { id: "ai-continue", label: "✦ Développer / Continuer", aiInstruction: "continue", run: (editor) => dispatchAITransform(editor, "continue") },
];

const slashSuggestionKey = new PluginKey("slashCommandsSuggestion");
const renderer = createSuggestionRenderer<SlashItem>(slashSuggestionKey);

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        pluginKey: slashSuggestionKey,
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowedPrefixes: [" ", "\n"],
        items: ({ query }) => {
          const normalized = query.toLowerCase();
          const reason = typeof navigator !== "undefined" && !navigator.onLine
            ? "Indisponible hors ligne"
            : aiService.isConfigured() ? undefined : "Configurez le Copilote IA dans Paramètres";
          return commands
            .filter((item) => item.label.toLowerCase().includes(normalized))
            .map((item) => item.aiInstruction
              ? { ...item, disabled: Boolean(reason), description: reason ?? "Aperçu avant insertion" }
              : item);
        },
        command: ({ editor, range, props }) => {
          if (props.aiInstruction) {
            props.run(editor);
            return;
          }
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        render: renderer.render,
      }),
    ];
  },
});

function dispatchAITransform(editor: Editor, instruction: NonNullable<SlashItem["aiInstruction"]>): void {
  window.dispatchEvent(new CustomEvent("pkm:ai-transform", {
    detail: { instruction, text: editor.getMarkdown() },
  }));
}

