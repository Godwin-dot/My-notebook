"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { createTask, deleteTask, logActivity } from "@/lib/db/repositories";
import type { PriorityLevel, TaskItem } from "@/types/models";
import { AIProposalCard } from "./AIProposalCard";
import { useAIStatus } from "../hooks/useAIStatus";
import { aiService, type AIExtractedTask } from "../services/ai-service";

interface TaskExtractionCardProps {
  sourceText: string;
  referenceDate: string;
  noteId: string | null;
  noteTitle?: string;
  /** Insère les tâches retenues dans la note ouverte (retourne quand le document est à jour). */
  insertIntoNote?: (tasks: string[]) => Promise<void> | void;
  /** Snapshot défensif exécuté avant toute écriture dans la note. */
  prepareNoteChange?: () => Promise<void>;
  onClose: () => void;
}

const priorityLabels: Record<PriorityLevel, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
};

export function TaskExtractionCard({
  sourceText,
  referenceDate,
  noteId,
  noteTitle,
  insertIntoNote,
  prepareNoteChange,
  onClose,
}: TaskExtractionCardProps) {
  const { disabledReason, configureService } = useAIStatus();
  const [tasks, setTasks] = useState<AIExtractedTask[] | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const canWriteNote = Boolean(noteId && insertIntoNote);

  useEffect(() => {
    const current = ++requestId.current;
    configureService();
    void aiService.extractTasksFromText(sourceText, referenceDate)
      .then((result) => {
        if (current !== requestId.current) return;
        setTasks(result);
        setSelected(result.map(() => true));
        if (!result.length) setError("Aucune action concrète détectée dans ce texte.");
      })
      .catch((caught: unknown) => {
        if (current !== requestId.current) return;
        setError(caught instanceof Error ? caught.message : "L’extraction des tâches a échoué.");
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [sourceText, referenceDate, configureService]);

  async function apply(mode: "note" | "week") {
    if (!tasks) return;
    const chosen = tasks.filter((_, index) => selected[index]);
    if (!chosen.length) {
      setError("Sélectionnez au moins une tâche à ajouter.");
      return;
    }
    setBusy(true);
    setError("");
    const created: TaskItem[] = [];
    try {
      if (mode === "note" && prepareNoteChange) await prepareNoteChange();
      for (const task of chosen) {
        created.push(await createTask({
          text: task.text,
          noteId: mode === "note" && canWriteNote ? noteId : null,
          scheduledDate: task.suggestedDate,
        }));
      }
      if (mode === "note" && insertIntoNote) {
        try {
          await insertIntoNote(chosen.map((task) => task.text));
        } catch (caught) {
          for (const task of created) await deleteTask(task.id).catch(() => undefined);
          throw caught;
        }
      }
      await logActivity({
        type: "ai_applied",
        entityId: noteId ?? undefined,
        entityTitle: noteTitle ?? "Tâches extraites",
        details: mode === "note"
          ? `${created.length} tâche(s) extraite(s) et ajoutée(s) à la note`
          : `${created.length} tâche(s) extraite(s) envoyée(s) au Semainier`,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les tâches n’ont pas pu être créées.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AIProposalCard
      title="Tâches détectées"
      loading={loading}
      error={error}
      applyLabel={canWriteNote ? "Ajouter à la note & au Semainier" : "Envoyer au Semainier"}
      applyDisabled={busy || !tasks || !tasks.length}
      secondaryLabel={canWriteNote ? "Envoyer uniquement au Semainier" : undefined}
      secondaryDisabled={busy || !tasks || !tasks.length}
      onApply={() => void apply(canWriteNote ? "note" : "week")}
      onSecondary={() => void apply("week")}
      onIgnore={() => {
        requestId.current += 1;
        onClose();
      }}
    >
      {loading ? null : (
        <ul className="task-extract-list">
          {(tasks ?? []).map((task, index) => (
            <li key={`${task.text}-${index}`}>
              <label className="task-extract-row">
                <input
                  type="checkbox"
                  checked={selected[index] ?? false}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((current) => current.map((value, position) => (position === index ? checked : value)));
                  }}
                />
                <span className="task-extract-text">{task.text}</span>
                <span className="task-extract-meta">
                  {task.suggestedDate ? (
                    <span className="task-extract-date">
                      <CalendarDays size={10} />
                      {new Date(`${task.suggestedDate}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  ) : (
                    <span className="task-extract-date task-extract-backlog">Backlog</span>
                  )}
                  <span className={`task-extract-priority task-extract-priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
                </span>
              </label>
            </li>
          ))}
          {tasks && !tasks.length ? <li className="task-extract-empty">Aucune action détectée.</li> : null}
        </ul>
      )}
      {disabledReason ? <p className="ai-proposal-error" role="alert">{disabledReason}</p> : null}
    </AIProposalCard>
  );
}
