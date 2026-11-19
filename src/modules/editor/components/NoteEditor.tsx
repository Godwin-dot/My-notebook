"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "@tiptap/markdown";
import { logActivity, saveNoteSnapshot, syncNoteTasks, updateNote } from "@/lib/db/repositories";
import type { AppSettings, Note } from "@/types/models";
import { SlashCommands } from "../extensions/slash-commands";
import { Callout } from "../extensions/callout";
import { Wikilink } from "../extensions/wikilink";
import { EditorToolbar } from "./EditorToolbar";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { insertEditorBlock, type EditorBlockType } from "../utils/insert-block";
import { aiService } from "@/modules/ai-copilot/services/ai-service";
import { AIProposalCard } from "@/modules/ai-copilot/components/AIProposalCard";
import { TaskExtractionCard } from "@/modules/ai-copilot/components/TaskExtractionCard";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";
import { db } from "@/lib/db/dexie";

export interface OutlineHeading {
  level: number;
  text: string;
  position: number;
}

interface NoteEditorProps {
  note: Note;
  settings?: AppSettings;
  onOutlineChange: (headings: OutlineHeading[]) => void;
}

interface TransformProposal {
  instruction: "structure" | "rewrite" | "continue" | "summarize";
  text: string;
  sourceMarkdown: string;
  range: { from: number; to: number } | null;
}

export function NoteEditor({ note, settings, onOutlineChange }: NoteEditorProps) {
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [proposal, setProposal] = useState<TransformProposal | null>(null);
  const [proposalResult, setProposalResult] = useState("");
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const [blockDropActive, setBlockDropActive] = useState(false);
  const [taskSource, setTaskSource] = useState<string | null>(null);
  const proposalRequestId = useRef(0);
  const { disabledReason, configureService } = useAIStatus();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  const extensions = useMemo(() => [
    StarterKit.configure({
      link: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Highlight,
    Typography,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Callout,
    Placeholder.configure({ placeholder: "Écrivez, tapez / pour les commandes, [[ pour lier une note…" }),
    SlashCommands,
    Wikilink,
    Markdown,
  ], []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: note.content,
    contentType: "markdown",
    editorProps: { attributes: { class: "tiptap-content", "aria-label": "Contenu de la note" } },
    onUpdate: ({ editor: currentEditor }) => {
      onOutlineChange(getOutline(currentEditor));
      setSaveState("saving");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingSaveRef.current = () => saveDocument(currentEditor, note.id);
      debounceRef.current = setTimeout(() => {
        const pendingSave = pendingSaveRef.current;
        pendingSaveRef.current = null;
        void pendingSave?.()
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, 300);
    },
    onCreate: ({ editor: currentEditor }) => {
      onOutlineChange(getOutline(currentEditor));
      let containsTasks = false;
      currentEditor.state.doc.descendants((node) => {
        if (node.type.name === "taskItem") containsTasks = true;
      });
      if (containsTasks) {
        setSaveState("saving");
        void saveDocument(currentEditor, note.id)
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }
    },
  }, [note.id]);

  useEffect(() => {
    if (!editor) return;
    if (editor.getMarkdown() !== note.content) {
      editor.commands.setContent(note.content, { emitUpdate: false, contentType: "markdown" });
      onOutlineChange(getOutline(editor));
    }
  }, [editor, note.content, onOutlineChange]);

  const prepareTransform = useCallback(async (
    instruction: TransformProposal["instruction"],
    text: string,
    range: { from: number; to: number } | null,
  ) => {
    if (!editor) return;
    if (!text.trim()) {
      setProposalError("Ajoutez du texte avant de demander une transformation.");
      return;
    }
    aiService.setSettings(settings);
    const requestId = ++proposalRequestId.current;
    setProposal(null);
    setProposalResult("");
    setProposalError("");
    setProposalLoading(true);
    const sourceMarkdown = editor.getMarkdown();
    try {
      const result = await aiService.transformText(text, instruction);
      if (requestId === proposalRequestId.current) {
        setProposal({ instruction, text, sourceMarkdown, range });
        setProposalResult(result);
      }
    } catch (caught) {
      if (requestId === proposalRequestId.current) {
        setProposalError(caught instanceof Error ? caught.message : "La transformation IA a échoué.");
      }
    } finally {
      if (requestId === proposalRequestId.current) setProposalLoading(false);
    }
  }, [editor, settings]);

  const requestTaskExtraction = useCallback((explicitText?: string | null) => {
    if (!editor) return;
    configureService();
    const { from, to } = editor.state.selection;
    const selected = from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";
    const text = (explicitText?.trim() ? explicitText : selected) || editor.getMarkdown();
    if (!text.trim()) {
      setProposalError("Ajoutez du texte avant d’extraire des tâches.");
      return;
    }
    setProposalError("");
    setTaskSource(text);
  }, [editor, configureService]);

  const insertTasksInNote = useCallback(async (labels: string[]) => {
    if (!editor) throw new Error("L’éditeur n’est pas disponible.");
    if (!labels.length) return;
    const markdown = `\n\n${labels.map((label) => `- [ ] ${label}`).join("\n")}\n`;
    const end = editor.state.doc.content.size;
    const applied = editor.chain().focus().insertContentAt(end, markdown, { contentType: "markdown" }).run();
    if (!applied) throw new Error("Les tâches n’ont pas pu être insérées dans la note.");
  }, [editor]);

  useEffect(() => {
    const handleExtract = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const payload = typeof detail === "object" && detail !== null ? detail as { text?: unknown } : null;
      requestTaskExtraction(typeof payload?.text === "string" ? payload.text : null);
    };
    window.addEventListener("pkm:ai-extract-tasks", handleExtract);
    return () => window.removeEventListener("pkm:ai-extract-tasks", handleExtract);
  }, [requestTaskExtraction]);

  useEffect(() => {
    const handleTransform = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "object" || detail === null) return;
      const payload = detail as { instruction?: unknown; text?: unknown; range?: unknown };
      if (
        (payload.instruction === "structure" || payload.instruction === "rewrite" || payload.instruction === "continue") &&
        typeof payload.text === "string"
      ) {
        const range = typeof payload.range === "object" && payload.range !== null &&
          "from" in payload.range && "to" in payload.range &&
          typeof payload.range.from === "number" && typeof payload.range.to === "number"
          ? { from: payload.range.from, to: payload.range.to }
          : null;
        void prepareTransform(payload.instruction, payload.text, range);
      }
    };
    window.addEventListener("pkm:ai-transform", handleTransform);
    return () => window.removeEventListener("pkm:ai-transform", handleTransform);
  }, [prepareTransform]);

  useEffect(() => {
    if (!editor) return;
    const handleInsertBlock = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "object" || detail === null) return;
      const payload = detail as { noteId?: unknown; type?: unknown; taskText?: unknown };
      const blockTypes: EditorBlockType[] = ["task", "checklist", "callout", "table", "code"];
      if (
        payload.noteId !== note.id ||
        typeof payload.type !== "string" ||
        !blockTypes.includes(payload.type as EditorBlockType)
      ) return;
      event.preventDefault();
      insertEditorBlock(
        editor,
        payload.type as EditorBlockType,
        typeof payload.taskText === "string" ? payload.taskText : "",
      );
    };
    window.addEventListener("pkm:insert-block", handleInsertBlock);
    return () => window.removeEventListener("pkm:insert-block", handleInsertBlock);
  }, [editor, note.id]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const pendingSave = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pendingSave) {
      void pendingSave().catch((error: unknown) => {
        console.error("La sauvegarde locale de la note a échoué pendant le changement de document.", error);
      });
    }
  }, []);

  useEffect(() => {
    if (!editor) return;
    const handleOutlineSelect = (event: Event) => {
      const position = (event as CustomEvent<number>).detail;
      editor.commands.setTextSelection(position);
      editor.commands.scrollIntoView();
      editor.view.focus();
    };
    window.addEventListener("pkm:outline-select", handleOutlineSelect);
    return () => window.removeEventListener("pkm:outline-select", handleOutlineSelect);
  }, [editor]);

  useEffect(() => {
    const handleWikilinkClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const title = event.target.closest<HTMLElement>(".wikilink")?.dataset.wikilink;
      if (!title) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent<string>("pkm:open-wikilink", { detail: title }));
    };
    document.addEventListener("click", handleWikilinkClick);
    return () => document.removeEventListener("click", handleWikilinkClick);
  }, []);

  const widthClass = settings?.editorWidth === "narrow"
    ? "max-w-2xl"
    : settings?.editorWidth === "wide" ? "max-w-5xl" : "max-w-3xl";
  const fontClass = settings?.fontFamily === "serif"
    ? "note-font-serif"
    : settings?.fontFamily === "mono" ? "note-font-mono" : "note-font-sans";

  async function applyTransformProposal(): Promise<void> {
    if (!editor || !proposal) return;
    if (editor.getMarkdown() !== proposal.sourceMarkdown) {
      setProposalError("La note a changé depuis la génération. Relancez l’action pour éviter d’écraser vos modifications.");
      setProposal(null);
      return;
    }
    try {
      await saveNoteSnapshot(note.id, note.title, proposal.sourceMarkdown, "before_ai");
      const applied = proposal.range
        ? editor.chain().focus().insertContentAt(
          proposal.instruction === "continue"
            ? { from: proposal.range.to, to: proposal.range.to }
            : proposal.range,
          proposalResult,
          { contentType: "markdown" },
        ).run()
        : editor.commands.setContent(proposalResult, { emitUpdate: true, contentType: "markdown" });
      if (!applied) throw new Error("La proposition n’a pas pu être appliquée à l’éditeur.");
      await logActivity({
        type: "ai_applied",
        entityId: note.id,
        entityTitle: note.title,
        details: "Transformation IA appliquée",
      });
      setProposal(null);
      setProposalError("");
    } catch (caught) {
      setProposalError(caught instanceof Error ? caught.message : "La proposition n’a pas pu être appliquée.");
    }
  }

  return (
    <div className="note-editor-scroll min-h-0 flex-1 overflow-y-auto">
      <div className={`note-editor-inner ${widthClass} ${fontClass}`}>
        {editor ? (
          <EditorBubbleMenu
            editor={editor}
            disabledReason={disabledReason}
            onTransform={(instruction, text, range) => void prepareTransform(instruction, text, range)}
            onExtractTasks={(text) => requestTaskExtraction(text)}
          />
        ) : null}
        {editor ? <EditorToolbar editor={editor} disabledReason={disabledReason} /> : null}
        <div
          className={`editor-canvas ${blockDropActive ? "editor-canvas-drop-active" : ""}`}
          onDragOver={(event) => {
            if (!Array.from(event.dataTransfer.types).includes("application/x-pkm-block")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setBlockDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBlockDropActive(false);
          }}
          onDrop={(event) => {
            const type = event.dataTransfer.getData("application/x-pkm-block");
            if (!["task", "checklist", "callout", "table", "code"].includes(type)) return;
            event.preventDefault();
            if (editor) {
              const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (position) editor.commands.setTextSelection(position.pos);
              insertEditorBlock(editor, type as EditorBlockType);
            }
            setBlockDropActive(false);
          }}
        >
          <EditorContent editor={editor} />
        </div>
        {proposalLoading ? (
          <AIProposalCard
            title="Transformation du texte"
            loading
            onApply={() => undefined}
            onIgnore={() => { proposalRequestId.current += 1; setProposalLoading(false); }}
          />
        ) : null}
        {proposalError ? (
          <AIProposalCard title="Transformation impossible" error={proposalError} onApply={() => undefined} onIgnore={() => setProposalError("")} />
        ) : null}
        {proposal ? (
          <AIProposalCard
            title={getTransformTitle(proposal.instruction)}
            onApply={() => void applyTransformProposal()}
            onIgnore={() => setProposal(null)}
          >
            <pre className="ai-proposal-markdown">{proposalResult}</pre>
          </AIProposalCard>
        ) : null}
        {taskSource ? (
          <TaskExtractionCard
            key={`${note.id}-${taskSource.slice(0, 40)}`}
            sourceText={taskSource}
            referenceDate={new Date().toISOString().slice(0, 10)}
            noteId={note.id}
            noteTitle={note.title}
            insertIntoNote={insertTasksInNote}
            prepareNoteChange={() => saveNoteSnapshot(note.id, note.title, editor?.getMarkdown() ?? note.content, "before_ai").then(() => undefined)}
            onClose={() => setTaskSource(null)}
          />
        ) : null}
        <p className={`editor-save-status ${saveState === "error" ? "editor-save-error" : ""}`}>
          {saveState === "error" ? "Échec de la sauvegarde locale" : saveState === "saving" ? "Sauvegarde en cours…" : "Markdown · enregistré localement"}
        </p>
      </div>
    </div>
  );
}

function getTransformTitle(instruction: TransformProposal["instruction"]): string {
  switch (instruction) {
    case "structure": return "Proposition de structure";
    case "rewrite": return "Proposition reformulée";
    case "continue": return "Suite proposée";
    case "summarize": return "Résumé proposé";
  }
}

async function saveDocument(editor: NonNullable<ReturnType<typeof useEditor>>, noteId: string): Promise<void> {
  const markdown = editor.getMarkdown()
    .replaceAll("\\[\\[", "[[")
    .replaceAll("\\]\\]", "]]");
  const tasks: Array<{ text: string; isCompleted: boolean }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskItem") {
      tasks.push({
        text: node.childCount ? node.child(0).textContent : node.textContent,
        isCompleted: Boolean(node.attrs.checked),
      });
    }
  });

  await updateNote(noteId, { content: markdown });
  await syncNoteTasks(noteId, tasks);
  const current = await db.notes.get(noteId);
  if (current) await saveNoteSnapshot(noteId, current.title, markdown, "auto");
}

function getOutline(editor: NonNullable<ReturnType<typeof useEditor>>): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "heading" && typeof node.attrs.level === "number") {
      headings.push({ level: node.attrs.level, text: node.textContent, position });
    }
  });
  return headings;
}

