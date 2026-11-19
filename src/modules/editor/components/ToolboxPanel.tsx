"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AlarmClock,
  Braces,
  Check,
  CheckSquare,
  FilePlus2,
  MessageSquareQuote,
  Pause,
  Play,
  RotateCcw,
  Table2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { createNote, createTask, toggleTaskCompletion } from "@/lib/db/repositories";
import { db } from "@/lib/db/dexie";
import type { Note, TaskItem } from "@/types/models";
import type { EditorBlockType } from "../utils/insert-block";

interface ToolboxPanelProps {
  note: Note | null;
  onOpenNote: (id: string) => void;
}

const blocks: Array<{ type: EditorBlockType; label: string; description: string; Icon: LucideIcon }> = [
  { type: "task", label: "Bulle de tâche", description: "Une action à suivre", Icon: CheckSquare },
  { type: "checklist", label: "Checklist", description: "Trois étapes prêtes", Icon: Check },
  { type: "callout", label: "Callout", description: "Un encart contextuel", Icon: MessageSquareQuote },
  { type: "table", label: "Tableau", description: "Grille structurée 3 × 3", Icon: Table2 },
  { type: "code", label: "Bloc de code", description: "Un espace monospace", Icon: Braces },
];

type TaskDestination = "note" | "today" | "backlog";
type TimerMode = "work" | "break";

const durationByMode: Record<TimerMode, number> = { work: 25 * 60, break: 5 * 60 };
const scratchpadUpdatedEvent = "pkm:scratchpad-updated";

function subscribeScratchpad(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(scratchpadUpdatedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(scratchpadUpdatedEvent, callback);
  };
}

function getScratchpadSnapshot(): string {
  try {
    return `ok:${window.localStorage.getItem("pkm_scratchpad") ?? ""}`;
  } catch {
    return "error:";
  }
}

function getServerScratchpadSnapshot(): string {
  return "ok:";
}

export function ToolboxPanel({ note, onOpenNote }: ToolboxPanelProps) {
  const [taskText, setTaskText] = useState("");
  const [destination, setDestination] = useState<TaskDestination>("note");
  const [taskError, setTaskError] = useState("");
  const [taskNotice, setTaskNotice] = useState("");
  const [tasksError, setTasksError] = useState("");
  const [timerMode, setTimerMode] = useState<TimerMode>("work");
  const [secondsRemaining, setSecondsRemaining] = useState(durationByMode.work);
  const [timerRunning, setTimerRunning] = useState(false);
  const [scratchpadError, setScratchpadError] = useState("");
  const [scratchpadNotice, setScratchpadNotice] = useState("");
  const scratchpadSnapshot = useSyncExternalStore(
    subscribeScratchpad,
    getScratchpadSnapshot,
    getServerScratchpadSnapshot,
  );
  const scratchpadUnavailable = scratchpadSnapshot.startsWith("error:");
  const scratchpad = scratchpadUnavailable ? "" : scratchpadSnapshot.slice(3);

  const tasks = useLiveQuery(
    () => note
      ? db.tasks.where("noteId").equals(note.id).sortBy("order")
      : Promise.resolve([] as TaskItem[]),
    [note?.id],
    [] as TaskItem[],
  ) ?? [];

  useEffect(() => {
    if (!timerRunning) return;
    const timeout = window.setTimeout(() => {
      if (secondsRemaining <= 1) {
        const nextMode: TimerMode = timerMode === "work" ? "break" : "work";
        setTimerRunning(false);
        setTimerMode(nextMode);
        setSecondsRemaining(durationByMode[nextMode]);
      } else {
        setSecondsRemaining((remaining) => remaining - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [secondsRemaining, timerMode, timerRunning]);

  function saveScratchpad(value: string) {
    try {
      if (value) window.localStorage.setItem("pkm_scratchpad", value);
      else window.localStorage.removeItem("pkm_scratchpad");
      window.dispatchEvent(new Event(scratchpadUpdatedEvent));
      setScratchpadError("");
    } catch {
      setScratchpadError("Le bloc-notes n’a pas pu être sauvegardé localement.");
    }
  }

  function insertBlock(type: EditorBlockType) {
    if (!note) {
      setTaskError("Ouvrez une note pour y insérer un bloc.");
      return;
    }
    const event = new CustomEvent("pkm:insert-block", {
      cancelable: true,
      detail: { noteId: note.id, type },
    });
    window.dispatchEvent(event);
    setTaskError(event.defaultPrevented ? "" : "L’éditeur de cette note n’est pas prêt.");
  }

  function startBlockDrag(event: React.DragEvent<HTMLElement>, type: EditorBlockType) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-pkm-block", type);
  }

  async function addQuickTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = taskText.trim();
    if (!text) {
      setTaskError("Saisissez un libellé de tâche.");
      return;
    }

    setTaskError("");
    setTaskNotice("");
    if (destination === "note") {
      if (!note) {
        setTaskError("Ouvrez une note avant d’y ajouter une tâche.");
        return;
      }
      const insertion = new CustomEvent("pkm:insert-block", {
        cancelable: true,
        detail: { noteId: note.id, type: "task", taskText: text },
      });
      window.dispatchEvent(insertion);
      if (!insertion.defaultPrevented) {
        setTaskError("L’éditeur de cette note n’est pas prêt.");
        return;
      }
      setTaskNotice("Tâche insérée dans la note.");
    } else {
      try {
        await createTask({
          text,
          scheduledDate: destination === "today" ? getLocalToday() : null,
        });
        setTaskNotice(destination === "today" ? "Tâche ajoutée à Aujourd’hui." : "Tâche ajoutée au backlog.");
      } catch (caught) {
        setTaskError(caught instanceof Error ? caught.message : "La tâche n’a pas pu être créée.");
        return;
      }
    }
    setTaskText("");
  }

  async function toggleTask(taskId: string) {
    setTasksError("");
    try {
      await toggleTaskCompletion(taskId);
    } catch (caught) {
      setTasksError(caught instanceof Error ? caught.message : "La tâche n’a pas pu être mise à jour.");
    }
  }

  async function convertScratchpadToNote() {
    const content = scratchpad.trim();
    if (!content) {
      setScratchpadError("Écrivez quelques lignes avant de créer une note.");
      return;
    }
    const firstLine = content.split(/\r?\n/).find((line) => line.trim()) ?? "";
    const title = firstLine.replace(/^#+\s*/, "").trim().slice(0, 100) || "Note depuis le bloc-notes";
    try {
      const created = await createNote({ title, content, status: "inbox" });
      saveScratchpad("");
      setScratchpadNotice("Note créée dans l’Inbox.");
      onOpenNote(created.id);
    } catch (caught) {
      setScratchpadError(caught instanceof Error ? caught.message : "La note n’a pas pu être créée.");
    }
  }

  const duration = durationByMode[timerMode];
  const progress = ((duration - secondsRemaining) / duration) * 100;

  return (
    <div className="toolbox-panel">
      <section className="toolbox-section">
        <header className="toolbox-section-heading">
          <div><p className="collection-kicker">INSERTION RAPIDE</p><h2>Bibliothèque de blocs</h2></div>
          <Braces size={15} />
        </header>
        <p className="toolbox-hint">Glissez un bloc dans la note, ou cliquez pour l’insérer au curseur.</p>
        <div className="toolbox-block-grid">
          {blocks.map(({ type, label, description, Icon }) => (
            <article
              key={type}
              className="toolbox-block-card bento-card"
              draggable
              onDragStart={(event) => startBlockDrag(event, type)}
            >
              <span className="toolbox-block-icon"><Icon size={15} /></span>
              <strong>{label}</strong>
              <small>{description}</small>
              <button type="button" className="toolbox-insert-button" disabled={!note} onClick={() => insertBlock(type)}>
                Insérer
              </button>
            </article>
          ))}
        </div>
        {taskError ? <p className="toolbox-error" role="alert">{taskError}</p> : null}
      </section>

      <section className="toolbox-section">
        <header className="toolbox-section-heading">
          <div><p className="collection-kicker">CAPTURE EXPRESS</p><h2>Nouvelle tâche</h2></div>
          <CheckSquare size={15} />
        </header>
        <form className="toolbox-task-form" onSubmit={(event) => void addQuickTask(event)}>
          <input
            value={taskText}
            onChange={(event) => setTaskText(event.target.value)}
            placeholder="Ex. Préparer le prochain atelier"
            aria-label="Libellé de la tâche"
          />
          <div className="toolbox-destinations" role="group" aria-label="Destination de la tâche">
            {([
              ["note", "Note active"],
              ["today", "Aujourd’hui"],
              ["backlog", "Backlog"],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={destination === value}
                className={destination === value ? "pill-active" : ""}
                onClick={() => setDestination(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="submit" className="toolbox-submit-button"><CheckSquare size={13} /> Ajouter</button>
        </form>
        {taskNotice ? <p className="toolbox-success" role="status">{taskNotice}</p> : null}
        {tasksError ? <p className="toolbox-error" role="alert">{tasksError}</p> : null}
        <div className="toolbox-task-list">
          <p className="toolbox-list-heading">{note ? `Tâches de « ${note.title || "Sans titre"} »` : "Aucune note active"}</p>
          {note && tasks.length ? tasks.map((task) => (
            <div className={`toolbox-task-row ${task.isCompleted ? "toolbox-task-row-done" : ""}`} key={task.id}>
              <button
                type="button"
                aria-label={task.isCompleted ? `Rouvrir ${task.text}` : `Terminer ${task.text}`}
                aria-pressed={task.isCompleted}
                onClick={() => void toggleTask(task.id)}
              >
                {task.isCompleted ? <Check size={12} /> : null}
              </button>
              <span>{task.text}</span>
            </div>
          )) : (
            <p className="toolbox-empty">{note ? "Les tâches de cette note apparaîtront ici." : "Ouvrez une note pour gérer ses tâches."}</p>
          )}
        </div>
      </section>

      <section className="toolbox-section">
        <header className="toolbox-section-heading">
          <div><p className="collection-kicker">RYTHME DE TRAVAIL</p><h2>Minuteur Focus</h2></div>
          <AlarmClock size={15} />
        </header>
        <div className="toolbox-widget bento-card">
          <div className="toolbox-timer-readout">
            <span>{timerMode === "work" ? "CONCENTRATION" : "PAUSE"}</span>
            <strong>{formatTime(secondsRemaining)}</strong>
          </div>
          <div className="toolbox-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="toolbox-widget-actions">
            <button type="button" onClick={() => setTimerRunning((running) => !running)}>
              {timerRunning ? <Pause size={13} /> : <Play size={13} />}
              {timerRunning ? "Pause" : "Démarrer"}
            </button>
            <button type="button" aria-label="Réinitialiser le minuteur" onClick={() => {
              setTimerRunning(false);
              setTimerMode("work");
              setSecondsRemaining(durationByMode.work);
            }}>
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>
          <button type="button" className="toolbox-mode-switch" onClick={() => {
            const nextMode: TimerMode = timerMode === "work" ? "break" : "work";
            setTimerRunning(false);
            setTimerMode(nextMode);
            setSecondsRemaining(durationByMode[nextMode]);
          }}>
            Basculer vers {timerMode === "work" ? "la pause de 5 min" : "le focus de 25 min"}
          </button>
        </div>
      </section>

      <section className="toolbox-section">
        <header className="toolbox-section-heading">
          <div><p className="collection-kicker">CAPTURE ÉPHÉMÈRE</p><h2>Scratchpad</h2></div>
          <FilePlus2 size={15} />
        </header>
        <div className="toolbox-widget bento-card">
          <textarea
            value={scratchpad}
            onChange={(event) => { saveScratchpad(event.target.value); setScratchpadNotice(""); }}
            placeholder="Une idée à garder sous la main…"
            aria-label="Bloc-notes volant"
          />
          <div className="toolbox-scratch-footer">
            <span>{scratchpadUnavailable ? "Stockage local indisponible" : "Sauvegardé localement"}</span>
            <button type="button" disabled={!scratchpad.trim()} onClick={() => void convertScratchpadToNote()}>
              <FilePlus2 size={12} /> Convertir en note
            </button>
          </div>
          {scratchpadNotice ? <p className="toolbox-success" role="status">{scratchpadNotice}</p> : null}
          {scratchpadError ? <p className="toolbox-error" role="alert">{scratchpadError}</p> : null}
        </div>
      </section>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function getLocalToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
