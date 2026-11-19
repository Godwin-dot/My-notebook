"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUp, Eraser, FilePlus2, Quote } from "lucide-react";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db/dexie";
import { createNote, logActivity, saveNoteSnapshot } from "@/lib/db/repositories";
import { searchEngine } from "@/lib/search/minisearch";
import type { Note } from "@/types/models";
import { aiService, type AIVaultContextNote } from "../services/ai-service";
import { useAIStatus } from "../hooks/useAIStatus";

interface VaultChatPanelProps {
  activeNote: Note | null;
  onOpenNote: (id: string) => void;
}

interface VaultMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedTitles?: string[];
}

const SUGGESTIONS = [
  "Résume mes projets en cours",
  "Quelles idées ai-je dans mon Inbox ?",
  "Fais le point sur mes notes récentes",
];

const MAX_CONTEXT_NOTES = 5;

export function VaultChatPanel({ activeNote, onOpenNote }: VaultChatPanelProps) {
  const { disabledReason } = useAIStatus();
  const notes = useLiveQuery(() => db.notes.toArray()) ?? [];
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);

  async function send(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || loading) return;
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    setMessages((current) => [...current, { id: uuid(), role: "user", content: question }]);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const context = await selectContextNotes(question, activeNote);
      const result = await aiService.askVault(question, context, history);
      setMessages((current) => [
        ...current,
        { id: uuid(), role: "assistant", content: result.answer, citedTitles: result.citedTitles },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La question n’a pas pu être traitée.");
    } finally {
      setLoading(false);
    }
  }

  function openCitation(title: string) {
    const target = notes.find((note) => note.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase());
    if (target) {
      setError("");
      onOpenNote(target.id);
      return;
    }
    setError(`La note « ${title} » est introuvable dans le coffre.`);
  }

  async function saveAsNote(message: VaultMessage) {
    const index = messages.findIndex((item) => item.id === message.id);
    const question = messages.slice(0, Math.max(index, 0)).reverse().find((item) => item.role === "user");
    const heading = question?.content ?? "Réponse du copilote";
    try {
      const note = await createNote({
        title: `Copilote — ${heading.slice(0, 70)}`,
        content: `# ${heading}\n\n${message.content}\n`,
        status: "inbox",
      });
      await saveNoteSnapshot(note.id, note.title, note.content, "before_ai");
      await logActivity({
        type: "ai_applied",
        entityId: note.id,
        entityTitle: note.title,
        details: "Réponse du copilote sauvegardée en note",
      });
      setSavedIds((current) => [...current, message.id]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La note n’a pas pu être créée.");
    }
  }

  function clearConversation() {
    setMessages([]);
    setSavedIds([]);
    setError("");
  }

  return (
    <section className="vault-chat" aria-label="Chat avec le coffre">
      <p className="vault-chat-intro">
        Posez une question sur votre coffre. Le copilote consulte les {MAX_CONTEXT_NOTES} notes les plus pertinentes et cite ses sources.
      </p>

      {messages.length === 0 ? (
        <div className="vault-chat-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              className="vault-chat-suggestion"
              onClick={() => void send(suggestion)}
              disabled={loading}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {messages.length ? (
        <div className="vault-chat-thread" role="log" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`vault-chat-message vault-chat-${message.role}`}>
              <span className="vault-chat-role">{message.role === "user" ? "Vous" : "Copilote"}</span>
              {message.role === "assistant" ? (
                <div className="vault-chat-answer">{renderAnswer(message.content, openCitation)}</div>
              ) : (
                <p className="vault-chat-answer">{message.content}</p>
              )}
              {message.role === "assistant" ? (
                <div className="vault-chat-message-actions">
                  {message.citedTitles?.length ? (
                    <span className="vault-chat-citations">
                      <Quote size={10} />
                      {message.citedTitles.length} source{message.citedTitles.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="vault-chat-save"
                    onClick={() => void saveAsNote(message)}
                    disabled={savedIds.includes(message.id)}
                  >
                    <FilePlus2 size={12} />
                    {savedIds.includes(message.id) ? "Note créée" : "Sauvegarder en note"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {loading ? <p className="vault-chat-loading" role="status">Recherche dans le coffre et rédaction…</p> : null}
      {error ? <p className="ai-proposal-error" role="alert">{error}</p> : null}
      {disabledReason ? <p className="ai-proposal-status">{disabledReason}</p> : null}

      <form
        className="vault-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Interroger mes notes…"
          aria-label="Question pour le coffre"
          disabled={loading}
        />
        <button type="submit" aria-label="Envoyer la question" disabled={loading || !draft.trim()}>
          <ArrowUp size={15} />
        </button>
      </form>

      {messages.length ? (
        <button type="button" className="vault-chat-clear" onClick={clearConversation}>
          <Eraser size={12} />Effacer la conversation
        </button>
      ) : null}
    </section>
  );
}

async function selectContextNotes(question: string, activeNote: Note | null): Promise<AIVaultContextNote[]> {
  const picked: Note[] = [];
  const seen = new Set<string>();
  const push = (note: Note | null | undefined) => {
    if (!note || seen.has(note.id) || picked.length >= MAX_CONTEXT_NOTES) return;
    seen.add(note.id);
    picked.push(note);
  };

  if (activeNote) push(activeNote);

  const ranked = searchEngine.search(question).slice(0, 10).map((result) => result.id);
  if (ranked.length) {
    const found = await db.notes.bulkGet(ranked);
    for (const note of found) push(note ?? undefined);
  }

  if (picked.length < MAX_CONTEXT_NOTES) {
    const recent = await db.notes.reverse().sortBy("updatedAt");
    for (const note of recent) {
      if (picked.length >= MAX_CONTEXT_NOTES) break;
      push(note);
    }
  }

  return picked.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
  }));
}

function renderAnswer(content: string, onOpenCitation: (title: string) => void) {
  const parts = content.split(/(\[\[[^\]\n]{1,160}\]\])/g);
  return parts.map((part, index) => {
    const match = /^\[\[([^\]\n]{1,160})\]\]$/.exec(part);
    if (!match) return <span key={index}>{part}</span>;
    return (
      <button
        type="button"
        key={index}
        className="vault-chat-citation"
        onClick={() => onOpenCitation(match[1])}
        title={`Ouvrir « ${match[1]} »`}
      >
        {part}
      </button>
    );
  });
}
