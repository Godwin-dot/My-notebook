"use client";

import { useState, type ReactNode } from "react";
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Sparkles,
  Table2,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { insertEditorBlock } from "../utils/insert-block";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";

export function EditorToolbar({ editor, disabledReason }: { editor: Editor; disabledReason?: string }) {
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  function runAI(instruction: "structure" | "rewrite" | "continue") {
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const text = hasSelection
      ? editor.state.doc.textBetween(from, to, "\n")
      : editor.getMarkdown();
    window.dispatchEvent(new CustomEvent("pkm:ai-transform", {
      detail: { instruction, text, range: hasSelection ? { from, to } : null },
    }));
    setAiMenuOpen(false);
  }

  function extractTasks() {
    const { from, to } = editor.state.selection;
    const text = from !== to ? editor.state.doc.textBetween(from, to, "\n") : null;
    window.dispatchEvent(new CustomEvent("pkm:ai-extract-tasks", { detail: { text } }));
    setAiMenuOpen(false);
  }

  return (
    <div className="editor-toolbar no-scrollbar flex items-center justify-between gap-2 flex-nowrap whitespace-nowrap" role="toolbar" aria-label="Outils de rédaction">
      <div className="editor-toolbar-group">
        <button type="button" className="editor-toolbar-task" title="Insérer une bulle de tâche" onClick={() => insertEditorBlock(editor, "task")}>
          <CheckSquare size={14} /><span>＋ Tâche</span>
        </button>
      </div>
      <div className="editor-toolbar-group">
        <ToolButton label="Titre 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolButton>
        <ToolButton label="Titre 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolButton>
        <ToolButton label="Titre 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></ToolButton>
        <span className="editor-toolbar-divider" />
        <ToolButton label="Gras" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolButton>
        <ToolButton label="Italique" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolButton>
        <ToolButton label="Code inline" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={14} /></ToolButton>
      </div>
      <div className="editor-toolbar-group">
        <ToolButton label="Liste à puces" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></ToolButton>
        <ToolButton label="Liste numérotée" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolButton>
        <ToolButton label="Citation" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><MessageSquareQuote size={14} /></ToolButton>
        <ToolButton label="Encart / Callout" active={editor.isActive("callout")} onClick={() => insertEditorBlock(editor, "callout")}><MessageSquareQuote size={14} /></ToolButton>
        <ToolButton label="Tableau 3 × 3" onClick={() => insertEditorBlock(editor, "table")}><Table2 size={14} /></ToolButton>
        <ToolButton label="Insérer [[lien]]" onClick={() => editor.chain().focus().insertContent("[[").run()}><Link2 size={14} /></ToolButton>
      </div>
      <div className="editor-toolbar-ai">
        <AIActionButton
          className="editor-toolbar-ai-trigger editor-toolbar-ai-extract"
          disabledReason={disabledReason}
          onClick={extractTasks}
        >
          <Sparkles size={14} /><span>✦ Extraire les tâches</span>
        </AIActionButton>
        <AIActionButton
          className="editor-toolbar-ai-trigger"
          disabledReason={disabledReason}
          ariaHasPopup="menu"
          ariaExpanded={aiMenuOpen}
          onClick={() => setAiMenuOpen((open) => !open)}
        >
          <Sparkles size={14} /> IA
        </AIActionButton>
        {aiMenuOpen ? (
          <div className="editor-toolbar-ai-menu" role="menu" aria-label="Actions IA de l’éditeur">
            <button type="button" role="menuitem" onClick={() => runAI("structure")}>✦ Structurer en plan</button>
            <button type="button" role="menuitem" onClick={() => runAI("rewrite")}>✦ Reformuler / Corriger</button>
            <button type="button" role="menuitem" onClick={() => runAI("continue")}>✦ Développer / Continuer</button>
            <button type="button" role="menuitem" onClick={extractTasks}>✦ Extraire les tâches</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`editor-toolbar-button ${active ? "editor-toolbar-button-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
