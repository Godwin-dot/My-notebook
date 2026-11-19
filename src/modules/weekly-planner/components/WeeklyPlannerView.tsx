"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { createTask, deleteTask, scheduleTask, toggleTaskCompletion } from "@/lib/db/repositories";
import { AIActionButton } from "@/modules/ai-copilot/components/AIActionButton";
import { AIProposalCard } from "@/modules/ai-copilot/components/AIProposalCard";
import { useAIStatus } from "@/modules/ai-copilot/hooks/useAIStatus";
import { aiService } from "@/modules/ai-copilot/services/ai-service";
import type { Note, TaskItem } from "@/types/models";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";

interface WeeklyPlannerViewProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onOpenNote: (id: string) => void;
}

interface PlannerDay {
  date: string;
  label: string;
  number: string;
  isToday: boolean;
}

const EMPTY_NOTES: Note[] = [];
const EMPTY_TASKS: TaskItem[] = [];
const EMPTY_CATEGORIES: Array<{ id: string; color: string }> = [];
const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function WeeklyPlannerView({ leftOpen, onToggleLeft, onOpenNote }: WeeklyPlannerViewProps) {
  const [today, setToday] = useState("");
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [aiError, setAIError] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [scheduleProposal, setScheduleProposal] = useState<Array<{ taskId: string; suggestedDate: string }> | null>(null);
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const aiRequestId = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const { disabledReason, configureService } = useAIStatus();
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? EMPTY_TASKS;
  const notes = useLiveQuery(() => db.notes.toArray()) ?? EMPTY_NOTES;
  const liveCategories = useLiveQuery(() => db.categories.toArray());
  const categories = liveCategories ?? EMPTY_CATEGORIES;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const localToday = getToday();
      setToday(localToday);
      setWeekStart(startOfWeek(parseLocalDate(localToday)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const days = useMemo<PlannerDay[]>(() => Array.from({ length: 7 }, (_, index) => {
    if (!weekStart) return null;
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateStr = formatDate(date);
    return {
      date: dateStr,
      label: dayNames[index],
      number: String(date.getDate()).padStart(2, "0"),
      isToday: dateStr === today,
    };
  }).filter((day): day is PlannerDay => day !== null), [weekStart, today]);

  const rangeLabel = useMemo(() => weekStart ? formatWeekRange(weekStart) : "", [weekStart]);
  const weekNumber = useMemo(() => weekStart ? getIsoWeek(weekStart) : 0, [weekStart]);
  const activeTasks = tasks.filter((task) => !task.isCompleted);
  const backlog = activeTasks.filter((task) => task.scheduledDate === null).sort((a, b) => a.order - b.order);
  const scheduledForWeek = tasks.filter((task) => task.scheduledDate && days.some((day) => day.date === task.scheduledDate));
  const mobileDate = mobileDay ?? days.find((day) => day.isToday)?.date ?? days[0]?.date ?? "backlog";
  const mobileTasks = mobileDate === "backlog"
    ? backlog
    : tasks.filter((task) => task.scheduledDate === mobileDate).sort((a, b) => a.order - b.order);
  const mobileDraftKey = mobileDate === "backlog" ? "backlog" : mobileDate;

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  function changeWeek(amount: number) {
    setWeekStart((current) => {
      if (!current) return current;
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  }

  if (!weekStart || !today) {
    return <div className="weekly-planner-view weekly-loading" role="status">Ouverture du semainier…</div>;
  }

  function moveTask(taskId: string, scheduledDate: string | null, newOrder?: number) {
    setError("");
    setHoverColumn(null);
    setDraggedTaskId(null);
    void scheduleTask(taskId, scheduledDate, newOrder).catch(() => setError("Impossible de déplacer cette tâche."));
  }

  function allowDrop(event: React.DragEvent<HTMLElement>, columnId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHoverColumn(columnId);
  }

  function dropTask(event: React.DragEvent<HTMLElement>, scheduledDate: string | null) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("application/x-pkm-task") || draggedTaskId;
    if (!taskId) return;

    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-task-id]")
      : null;
    if (target?.dataset.taskId === taskId) {
      setHoverColumn(null);
      setDraggedTaskId(null);
      return;
    }

    let newOrder: number | undefined;
    if (target?.dataset.taskId) {
      const targetIndex = tasks
        .filter((task) => task.scheduledDate === scheduledDate && task.id !== taskId)
        .sort((left, right) => left.order - right.order)
        .findIndex((task) => task.id === target.dataset.taskId);
      if (targetIndex >= 0) {
        const bounds = target.getBoundingClientRect();
        newOrder = targetIndex + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
      }
    }
    moveTask(taskId, scheduledDate, newOrder);
  }

  async function addTask(date: string | null) {
    const key = date ?? "backlog";
    const text = drafts[key]?.trim();
    if (!text) return;
    setError("");
    try {
      await createTask({ text, scheduledDate: date });
      setDrafts((current) => ({ ...current, [key]: "" }));
    } catch {
      setError("La tâche n’a pas pu être ajoutée.");
    }
  }

  async function toggle(taskId: string) {
    setError("");
    try {
      await toggleTaskCompletion(taskId);
    } catch {
      setError("La tâche n’a pas pu être mise à jour. Vérifiez qu’elle existe toujours dans sa note.");
    }
  }

  async function removeFloatingTask(task: TaskItem) {
    const confirmed = await confirm({
      title: "Supprimer cette tâche ?",
      description: task.noteId === null
        ? `« ${task.text} » sera définitivement supprimée du Semainier.`
        : `« ${task.text} » sera supprimée du Semainier et de la note qui la contient.`,
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteTask(task.id);
    } catch {
      setError("La tâche n’a pas pu être supprimée.");
    }
  }

  async function suggestSchedule() {
    configureService();
    const requestId = ++aiRequestId.current;
    setAIError("");
    setScheduleProposal(null);
    setAILoading(true);
    try {
      const result = await aiService.suggestWeeklySchedule(backlog, days.map((day) => day.date));
      if (requestId === aiRequestId.current) setScheduleProposal(result);
    } catch (caught) {
      if (requestId === aiRequestId.current) setAIError(caught instanceof Error ? caught.message : "La suggestion de planning a échoué.");
    } finally {
      if (requestId === aiRequestId.current) setAILoading(false);
    }
  }

  async function applySchedule() {
    if (!scheduleProposal) return;
    setError("");
    setAIError("");
    try {
      for (const suggestion of scheduleProposal) {
        const task = tasks.find((item) => item.id === suggestion.taskId);
        if (!task || task.isCompleted || task.scheduledDate !== null) {
          throw new Error("Une tâche proposée a changé depuis la génération. Relancez la suggestion.");
        }
        await scheduleTask(suggestion.taskId, suggestion.suggestedDate);
      }
      setScheduleProposal(null);
    } catch (caught) {
      setAIError(caught instanceof Error ? caught.message : "Le planning proposé n’a pas pu être appliqué.");
    }
  }

  return (
    <div className="weekly-planner-view">
      <header className="weekly-planner-header">
        <div className="flex items-start gap-3">
          <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} />
          <div>
            <p className="collection-kicker">PLANIFICATION · {scheduledForWeek.length} TÂCHES CETTE SEMAINE</p>
            <h1>Semainier</h1>
            <p className="weekly-range">Semaine {weekNumber} <span>—</span> {rangeLabel}</p>
          </div>
        </div>
        <div className="weekly-header-actions">
          <div className="week-nav">
            <button type="button" className="icon-button" aria-label="Semaine précédente" onClick={() => changeWeek(-1)}><ArrowLeft size={15} /></button>
            <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Cette semaine</button>
            <button type="button" className="icon-button" aria-label="Semaine suivante" onClick={() => changeWeek(1)}><ArrowRight size={15} /></button>
          </div>
          <button type="button" className="weekly-scroll-button" onClick={() => boardRef.current?.scrollBy({ left: -520, behavior: "smooth" })}>◀ Début</button>
          <button type="button" className="weekly-scroll-button" onClick={() => boardRef.current?.scrollBy({ left: 520, behavior: "smooth" })}>Fin ▶</button>
          <AIActionButton className="ai-button" disabledReason={disabledReason} loading={aiLoading} onClick={() => void suggestSchedule()}>
            <Sparkles size={14} /> Suggérer un planning
          </AIActionButton>
        </div>
      </header>

      {error ? <p className="weekly-error" role="alert">{error}</p> : null}
      {aiError ? <p className="weekly-error" role="alert">{aiError}</p> : null}
      {aiLoading ? (
        <AIProposalCard
          title="Répartition hebdomadaire"
          loading
          onApply={() => undefined}
          onIgnore={() => { aiRequestId.current += 1; setAILoading(false); }}
        />
      ) : null}
      {scheduleProposal ? (
        <AIProposalCard title="Planning suggéré" applyLabel="Appliquer le planning" error={aiError || undefined} onApply={() => void applySchedule()} onIgnore={() => setScheduleProposal(null)}>
          <ul className="ai-schedule-list">
            {scheduleProposal.map((suggestion) => {
              const task = backlog.find((item) => item.id === suggestion.taskId);
              const day = days.find((item) => item.date === suggestion.suggestedDate);
              return task ? <li key={suggestion.taskId}><span>{task.text}</span><strong>{day ? `${day.label} ${day.number}` : suggestion.suggestedDate}</strong></li> : null;
            })}
            {!scheduleProposal.length ? <li>Aucune répartition valide n’a été proposée.</li> : null}
          </ul>
        </AIProposalCard>
      ) : null}

      <div className="weekly-mobile-planner">
        <div className="weekly-mobile-tabs" role="tablist" aria-label="Choisir un jour">
          <button
            type="button"
            role="tab"
            aria-selected={mobileDate === "backlog"}
            className={`weekly-mobile-day ${mobileDate === "backlog" ? "weekly-mobile-day-active" : ""}`}
            onClick={() => setMobileDay("backlog")}
          >
            <span>Backlog</span>
            <strong>{backlog.length}</strong>
          </button>
          {days.map((day) => {
            const count = tasks.filter((task) => task.scheduledDate === day.date).length;
            return (
              <button
                type="button"
                role="tab"
                key={day.date}
                aria-selected={mobileDate === day.date}
                className={`weekly-mobile-day ${mobileDate === day.date ? "weekly-mobile-day-active" : ""} ${day.isToday ? "weekly-mobile-day-today" : ""}`}
                onClick={() => setMobileDay(day.date)}
              >
                <span>{day.label.slice(0, 3)}</span>
                <strong>{day.number}</strong>
                <small>{count}</small>
              </button>
            );
          })}
        </div>

        <section className={`planner-column weekly-mobile-column ${mobileDate !== "backlog" && days.find((day) => day.date === mobileDate)?.isToday ? "planner-today ambient-glow" : ""}`}>
          <header className="planner-column-header">
            <div className="planner-day-name">
              <span className="planner-column-dot planner-backlog-dot" />
              <span>{mobileDate === "backlog" ? "Backlog" : days.find((day) => day.date === mobileDate)?.label}</span>
              {mobileDate !== "backlog" ? <strong>{days.find((day) => day.date === mobileDate)?.number}</strong> : null}
            </div>
            <span className="planner-task-count">{mobileTasks.length}</span>
          </header>
          <p className="planner-column-subtitle">{mobileDate === "backlog" ? "À planifier" : "Tâches du jour sélectionné"}</p>
          <div className="planner-task-list">
            {mobileTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                source={task.noteId ? noteById.get(task.noteId) : undefined}
                sourceColor={task.noteId ? categoryById.get(noteById.get(task.noteId)?.categoryId ?? "")?.color : undefined}
                allDays={days}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragEnd={() => { setDraggedTaskId(null); setHoverColumn(null); }}
                onMove={moveTask}
                onToggle={() => void toggle(task.id)}
                onOpenNote={onOpenNote}
                onDelete={() => void removeFloatingTask(task)}
              />
            ))}
            {!mobileTasks.length ? (
              <p className="planner-drop-hint">
                {mobileDate === "backlog" ? "Le backlog est vide." : "Aucune tâche pour ce jour."}
              </p>
            ) : null}
          </div>
          <TaskComposer
            value={drafts[mobileDraftKey] ?? ""}
            onChange={(value) => setDrafts((current) => ({ ...current, [mobileDraftKey]: value }))}
            onSubmit={() => void addTask(mobileDate === "backlog" ? null : mobileDate)}
            placeholder={mobileDate === "backlog" ? "Ajouter au backlog" : "Ajouter une tâche"}
          />
        </section>
      </div>

      <div ref={boardRef} className="weekly-board-scroll">
        <div className="weekly-board">
          <section
          className={`planner-column planner-backlog min-w-[295px] w-[295px] shrink-0 h-full flex flex-col ${hoverColumn === "backlog" ? "planner-column-over" : ""}`}
          onDragOver={(event) => allowDrop(event, "backlog")}
          onDragLeave={() => setHoverColumn(null)}
          onDrop={(event) => dropTask(event, null)}
        >
          <header className="planner-column-header">
            <div><span className="planner-column-dot planner-backlog-dot" /><strong>Backlog</strong></div>
            <span className="planner-task-count">{backlog.length}</span>
          </header>
          <p className="planner-column-subtitle">À planifier</p>
          <div className="planner-task-list">
            {backlog.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                source={task.noteId ? noteById.get(task.noteId) : undefined}
                sourceColor={task.noteId ? categoryById.get(noteById.get(task.noteId)?.categoryId ?? "")?.color : undefined}
                allDays={days}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragEnd={() => { setDraggedTaskId(null); setHoverColumn(null); }}
                onMove={moveTask}
                onToggle={() => void toggle(task.id)}
                onOpenNote={onOpenNote}
                onDelete={() => void removeFloatingTask(task)}
              />
            ))}
            {!backlog.length ? <p className="planner-drop-hint">Glissez une tâche ici pour la garder à planifier.</p> : null}
          </div>
          <TaskComposer
            value={drafts.backlog ?? ""}
            onChange={(value) => setDrafts((current) => ({ ...current, backlog: value }))}
            onSubmit={() => void addTask(null)}
            placeholder="Ajouter une tâche au backlog"
          />
        </section>

        <div className="planner-days">
          {days.map((day) => {
            const dayTasks = tasks.filter((task) => task.scheduledDate === day.date).sort((a, b) => a.order - b.order);
            return (
              <section
                key={day.date}
                className={`planner-column planner-day-column min-w-[295px] w-[295px] shrink-0 h-full flex flex-col ${day.isToday ? "planner-today ambient-glow" : ""} ${hoverColumn === day.date ? "planner-column-over" : ""}`}
                onDragOver={(event) => allowDrop(event, day.date)}
                onDragLeave={() => setHoverColumn(null)}
                onDrop={(event) => dropTask(event, day.date)}
              >
                <header className="planner-column-header">
                  <div className="planner-day-name"><span>{day.label}</span><strong>{day.number}</strong></div>
                  <span className="planner-task-count">{dayTasks.length}</span>
                </header>
                <div className="planner-task-list">
                  {dayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      source={task.noteId ? noteById.get(task.noteId) : undefined}
                      sourceColor={task.noteId ? categoryById.get(noteById.get(task.noteId)?.categoryId ?? "")?.color : undefined}
                      allDays={days}
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onDragEnd={() => { setDraggedTaskId(null); setHoverColumn(null); }}
                      onMove={moveTask}
                      onToggle={() => void toggle(task.id)}
                      onOpenNote={onOpenNote}
                      onDelete={() => void removeFloatingTask(task)}
                    />
                  ))}
                </div>
                <TaskComposer
                  value={drafts[day.date] ?? ""}
                  onChange={(value) => setDrafts((current) => ({ ...current, [day.date]: value }))}
                  onSubmit={() => void addTask(day.date)}
                  placeholder="Ajouter une tâche"
                  compact
                />
              </section>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  source,
  sourceColor,
  allDays,
  onDragStart,
  onDragEnd,
  onMove,
  onToggle,
  onOpenNote,
  onDelete,
}: {
  task: TaskItem;
  source?: Note;
  sourceColor?: string;
  allDays: PlannerDay[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (taskId: string, date: string | null) => void;
  onToggle: () => void;
  onOpenNote: (id: string) => void;
  onDelete: () => void;
}) {
  return (
    <article
      data-task-id={task.id}
      className={`planner-task-card ${task.isCompleted ? "planner-task-complete" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-pkm-task", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="planner-task-check" aria-label={task.isCompleted ? "Marquer comme non terminée" : "Marquer comme terminée"} onClick={onToggle}>
        {task.isCompleted ? <Check size={12} /> : <Circle size={13} />}
      </button>
      <span className="planner-task-copy">
        <span className="planner-task-text">{task.text}</span>
        {source ? (
          <button type="button" className="planner-task-source" onClick={() => onOpenNote(source.id)}>
            <i style={{ backgroundColor: sourceColor ?? "#52525B" }} />{source.title}
          </button>
        ) : <span className="planner-floating-label">Tâche volante</span>}
      </span>
      <select
        className="planner-move-select"
        aria-label={`Déplacer « ${task.text} »`}
        value={task.scheduledDate ?? ""}
        onChange={(event) => onMove(task.id, event.target.value || null)}
      >
        <option value="">Backlog</option>
        {allDays.map((day) => <option value={day.date} key={day.date}>{day.label} {day.number}</option>)}
      </select>
      <button type="button" className="planner-task-delete" aria-label={`Supprimer ${task.text}`} onClick={onDelete}><Trash2 size={12} /></button>
    </article>
  );
}

function TaskComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <form
      className={`planner-task-composer ${compact ? "planner-task-composer-compact" : ""}`}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
    >
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button type="submit" aria-label="Ajouter"><Plus size={14} /></button>
    </form>
  );
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getToday(): string {
  return formatDate(new Date());
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const first = start.toLocaleDateString("fr-FR", { day: "numeric" });
  const last = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${first} au ${last}`;
}

function getIsoWeek(date: Date): number {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
