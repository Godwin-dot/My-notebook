"use client";

import { useRef, useState } from "react";
import { Archive, ArrowUpRight, FolderInput, ListChecks, Sparkles } from "lucide-react";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { logActivity, promoteToProject, saveNoteSnapshot, syncNoteTasks, updateNote } from "@/lib/db/repositories";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";
import { AIProposalCard } from "@/modules/ai-copilot/components/AIProposalCard";
import { TaskExtractionCard } from "@/modules/ai-copilot/components/TaskExtractionCard";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";
import { aiService, type AIClassificationResult } from "@/modules/ai-copilot/services/ai-service";
import type { Note } from "@/types/models";
import type { NoteStatus } from "@/types/models";

interface InboxViewProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onOpenNote: (id: string) => void;
}

const nextStatuses: Array<{ value: NoteStatus; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "active", label: "En cours" },
  { value: "archived", label: "Archivé" },
];

export function InboxView({ leftOpen, onToggleLeft, onOpenNote }: InboxViewProps) {
  const [error, setError] = useState("");
  const [aiError, setAIError] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [proposal, setProposal] = useState<InboxProposal | null>(null);
  const [taskTarget, setTaskTarget] = useState<{ noteId: string; text: string } | null>(null);
  const aiRequestId = useRef(0);
  const { disabledReason, configureService } = useAIStatus();
  const notes = useLiveQuery(
    () => db.notes.where("status").equals("inbox").reverse().sortBy("createdAt"),
  ) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? [];
  const allNotes = useLiveQuery(() => db.notes.toArray()) ?? [];

  async function prepareClassification(note: Note) {
    configureService();
    const requestId = ++aiRequestId.current;
    setAILoading(true);
    setAIError("");
    setProposal(null);
    try {
      const result = await aiService.classifyNote(note, categories, allNotes.map((item) => item.title).filter(Boolean));
      if (requestId === aiRequestId.current) setProposal({ kind: "classification", noteId: note.id, result });
    } catch (caught) {
      if (requestId === aiRequestId.current) setAIError(caught instanceof Error ? caught.message : "Le classement IA a échoué.");
    } finally {
      if (requestId === aiRequestId.current) setAILoading(false);
    }
  }

  async function prepareProject(note: Note) {
    configureService();
    const requestId = ++aiRequestId.current;
    setAILoading(true);
    setAIError("");
    setProposal(null);
    try {
      const result = await aiService.convertIdeaToProject(`${note.title}\n\n${note.content}`.trim());
      if (requestId === aiRequestId.current) setProposal({ kind: "project", noteId: note.id, result });
    } catch (caught) {
      if (requestId === aiRequestId.current) setAIError(caught instanceof Error ? caught.message : "La conversion en projet a échoué.");
    } finally {
      if (requestId === aiRequestId.current) setAILoading(false);
    }
  }

  async function applyProposal() {
    if (!proposal) return;
    setError("");
    try {
      const note = allNotes.find((item) => item.id === proposal.noteId);
      if (!note) throw new Error("Cette note n’existe plus.");
      await saveNoteSnapshot(note.id, note.title, note.content, "before_ai");
      if (proposal.kind === "classification") {
        await updateNote(note.id, {
          categoryId: proposal.result.suggestedCategoryId,
          tags: proposal.result.suggestedTags,
          summary: proposal.result.summary,
        });
      } else {
        const { content, tasks } = addProjectTasks(proposal.result.content, proposal.result.tasks);
        await updateNote(note.id, {
          title: proposal.result.title,
          content,
          isProject: true,
          status: note.status === "inbox" ? "active" : note.status,
        });
        await syncNoteTasks(note.id, tasks);
        await logActivity({
          type: "project_promoted",
          entityId: note.id,
          entityTitle: proposal.result.title,
          details: "Projet créé depuis une proposition IA",
        });
      }
      await logActivity({
        type: "ai_applied",
        entityId: note.id,
        entityTitle: proposal.kind === "project" ? proposal.result.title : note.title,
        details: proposal.kind === "project" ? "Conversion IA en fiche Projet appliquée" : "Classement IA appliqué",
      });
      setProposal(null);
      setAIError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La proposition n’a pas pu être appliquée.");
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch {
      setError("Cette modification n’a pas pu être enregistrée localement.");
    }
  }

  return (
    <div className="collection-view">
      <header className="collection-header">
        <div className="flex items-start gap-3">
          <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} />
          <div>
            <p className="collection-kicker">CAPTURE BRUTE · {String(notes.length).padStart(2, "0")}</p>
            <h1>Inbox</h1>
            <p className="collection-description">Idées et notes en attente de tri.</p>
          </div>
        </div>
        <kbd className="collection-shortcut">ALT + N</kbd>
      </header>

      {error ? <p className="collection-error" role="alert">{error}</p> : null}
      {notes.length === 0 ? (
        <div className="collection-empty">
          <div className="empty-glyph"><FolderInput size={19} /></div>
          <h2>Inbox vide</h2>
          <p>Appuyez sur Alt + N pour capturer une idée.</p>
        </div>
      ) : (
        <div className="inbox-list">
          {notes.map((note) => {
            const category = categories.find((item) => item.id === note.categoryId);
            return (
              <article className="inbox-item" key={note.id}>
                <button type="button" className="inbox-item-main" onClick={() => onOpenNote(note.id)}>
                  <span className="inbox-item-heading">
                    <strong>{note.title || "Sans titre"}</strong>
                    <span className="inbox-date">{new Date(note.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="inbox-excerpt">{note.content.replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").slice(0, 180) || "Aucun contenu — ouvrir pour ajouter des détails."}</span>
                  <span className="inbox-metadata">
                    {category ? <span className="inbox-category"><i style={{ backgroundColor: category.color }} />{category.name}</span> : null}
                    {note.tags.map((tag) => <span className="inbox-tag" key={tag}>{tag}</span>)}
                  </span>
                </button>
                <div className="inbox-actions">
                  <select
                    aria-label={`Changer le statut de ${note.title}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) void run(() => updateNote(note.id, { status: event.target.value as NoteStatus }));
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="" disabled>Statut</option>
                    {nextStatuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}
                  </select>
                  <select
                    aria-label={`Assigner une catégorie à ${note.title}`}
                    value={note.categoryId ?? ""}
                    onChange={(event) => void run(() => updateNote(note.id, { categoryId: event.target.value || null }))}
                  >
                    <option value="">Catégorie</option>
                    {categories.map((categoryItem) => <option value={categoryItem.id} key={categoryItem.id}>{categoryItem.name}</option>)}
                  </select>
                  <button type="button" className="inbox-icon-action" title="Promouvoir en projet" onClick={() => void run(() => promoteToProject(note.id))}>
                    <ArrowUpRight size={14} /><span>Projet</span>
                  </button>
                  <button type="button" className="inbox-icon-action" title="Archiver" onClick={() => void run(() => updateNote(note.id, { status: "archived" }))}>
                    <Archive size={14} />
                  </button>
                  <AIActionButton className="inbox-icon-action inbox-ai-disabled" disabledReason={disabledReason} loading={aiLoading} onClick={() => void prepareClassification(note)}>
                    <Sparkles size={14} /><span>Auto-classer</span>
                  </AIActionButton>
                  <AIActionButton className="inbox-icon-action inbox-ai-disabled" disabledReason={disabledReason} loading={aiLoading} onClick={() => void prepareProject(note)}>
                    <Sparkles size={14} /><span>Fiche Projet</span>
                  </AIActionButton>
                  <AIActionButton
                    className="inbox-icon-action inbox-ai-disabled"
                    disabledReason={disabledReason}
                    onClick={() => setTaskTarget({ noteId: note.id, text: `${note.title}\n\n${note.content}`.trim() })}
                  >
                    <ListChecks size={14} /><span>✦ Tâches</span>
                  </AIActionButton>
                </div>
                {proposal?.noteId === note.id ? (
                  <AIProposalCard
                    title={proposal.kind === "classification" ? "Proposition de classement" : "Conversion en fiche Projet"}
                    onApply={() => void applyProposal()}
                    onIgnore={() => setProposal(null)}
                  >
                    {proposal.kind === "classification" ? (
                      <div className="ai-proposal-markdown">
                        <p><strong>Catégorie :</strong> {categories.find((category) => category.id === proposal.result.suggestedCategoryId)?.name ?? "Aucune"}</p>
                        <p><strong>Résumé :</strong> {proposal.result.summary || "Aucun résumé"}</p>
                        <p><strong>Étiquettes :</strong> {proposal.result.suggestedTags.map((tag) => `#${tag}`).join(" · ") || "Aucune"}</p>
                      </div>
                    ) : (
                      <div className="ai-proposal-markdown">
                        <strong>{proposal.result.title}</strong>
                        <pre>{proposal.result.content}</pre>
                        {proposal.result.tasks.length ? <p>{proposal.result.tasks.length} tâche{proposal.result.tasks.length > 1 ? "s" : ""} proposée{proposal.result.tasks.length > 1 ? "s" : ""}</p> : null}
                      </div>
                    )}
                  </AIProposalCard>
                ) : null}
                {taskTarget?.noteId === note.id ? (
                  <TaskExtractionCard
                    key={`${taskTarget.noteId}-${taskTarget.text.slice(0, 40)}`}
                    sourceText={taskTarget.text}
                    referenceDate={new Date().toISOString().slice(0, 10)}
                    noteId={note.id}
                    noteTitle={note.title}
                    prepareNoteChange={() => saveNoteSnapshot(note.id, note.title, note.content, "before_ai").then(() => undefined)}
                    insertIntoNote={(labels) => insertTasksIntoInboxNote(note.id, labels)}
                    onClose={() => setTaskTarget(null)}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {aiLoading ? (
        <AIProposalCard
          title="Préparation de la proposition IA"
          loading
          onApply={() => undefined}
          onIgnore={() => { aiRequestId.current += 1; setAILoading(false); }}
        />
      ) : null}
      {aiError ? <p className="collection-error" role="alert">{aiError}</p> : null}
    </div>
  );
}

type InboxProposal =
  | { kind: "classification"; noteId: string; result: AIClassificationResult }
  | { kind: "project"; noteId: string; result: { title: string; content: string; tasks: string[] } };

async function insertTasksIntoInboxNote(noteId: string, labels: string[]): Promise<void> {
  if (!labels.length) return;
  const current = await db.notes.get(noteId);
  if (!current) throw new Error("Cette note n’existe plus.");
  const body = current.content.trimEnd();
  const block = labels.map((label) => `- [ ] ${label}`).join("\n");
  await updateNote(noteId, { content: `${body}${body ? "\n\n" : ""}${block}\n` });
}

function addProjectTasks(content: string, tasks: string[]): {
  content: string;
  tasks: Array<{ text: string; isCompleted: boolean }>;
} {
  const lines = content.split(/\r?\n/);
  const existing: Array<{ text: string; isCompleted: boolean }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*+]|\d+\.)\s+\[([ xX])\]\s*(.+)$/);
    if (match?.[2]) existing.push({ text: match[2].trim(), isCompleted: match[1].toLowerCase() === "x" });
  }
  const known = new Set(existing.map((task) => task.text.toLocaleLowerCase()));
  const added = tasks.filter((task) => !known.has(task.toLocaleLowerCase()));
  const nextContent = added.length
    ? `${content.trim()}${content.trim() ? "\n\n" : ""}## Prochaines étapes\n${added.map((task) => `- [ ] ${task}`).join("\n")}\n`
    : content;
  return {
    content: nextContent,
    tasks: [...existing, ...added.map((text) => ({ text, isCompleted: false }))],
  };
}
