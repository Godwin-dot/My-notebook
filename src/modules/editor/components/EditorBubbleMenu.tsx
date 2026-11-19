"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";

export type EditorAITransform = "structure" | "rewrite" | "continue";

interface EditorBubbleMenuProps {
  editor: Editor;
  disabledReason?: string;
  onTransform: (instruction: EditorAITransform, text: string, range: { from: number; to: number }) => void;
  onExtractTasks: (text: string) => void;
}

/**
 * Pilule flottante d'actions IA affichée uniquement sur une sélection non vide.
 * Aucun appel réseau n'est déclenché ici : chaque action ouvre une proposition à valider.
 */
export function EditorBubbleMenu({ editor, disabledReason, onTransform, onExtractTasks }: EditorBubbleMenuProps) {
  function currentSelection(): { from: number; to: number; text: string } | null {
    const { from, to } = editor.state.selection;
    if (from === to) return null;
    return { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
  }

  return (
    <BubbleMenu
      editor={editor}
      className="editor-ai-toolbar"
      shouldShow={({ from, to }) => from !== to}
      updateDelay={120}
      options={{ placement: "top", offset: 10 }}
    >
      <AIActionButton
        className="editor-ai-action"
        disabledReason={disabledReason}
        onClick={() => {
          const selection = currentSelection();
          if (!selection) return;
          onTransform("rewrite", selection.text, { from: selection.from, to: selection.to });
        }}
      >
        ✦ Reformuler
      </AIActionButton>
      <AIActionButton
        className="editor-ai-action"
        disabledReason={disabledReason}
        onClick={() => {
          const selection = currentSelection();
          if (!selection) return;
          onTransform("structure", selection.text, { from: selection.from, to: selection.to });
        }}
      >
        ✦ Structurer
      </AIActionButton>
      <AIActionButton
        className="editor-ai-action"
        disabledReason={disabledReason}
        onClick={() => {
          const selection = currentSelection();
          if (!selection) return;
          onTransform("continue", selection.text, { from: selection.from, to: selection.to });
        }}
      >
        ✦ Continuer
      </AIActionButton>
      <AIActionButton
        className="editor-ai-action editor-ai-action-accent"
        disabledReason={disabledReason}
        onClick={() => {
          const selection = currentSelection();
          if (!selection) return;
          onExtractTasks(selection.text);
        }}
      >
        ✦ Extraire tâches
      </AIActionButton>
    </BubbleMenu>
  );
}
