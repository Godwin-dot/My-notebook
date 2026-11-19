"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, CalendarDays, Check, FolderKanban, Inbox, Network, Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db/dexie";
import { createTask, getOrCreateDailyNote, toggleTaskCompletion } from "@/lib/db/repositories";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";
import type { ActivityLog, Category, Note, TaskItem } from "@/types/models";
import { useState, useSyncExternalStore } from "react";

interface DashboardViewProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onNavigate: (view: string) => void;
  onOpenNote: (id: string) => void;
}

const EMPTY: never[] = [];

export function DashboardView({ leftOpen, onToggleLeft, onNavigate, onOpenNote }: DashboardViewProps) {
  const notes = useLiveQuery(() => db.notes.toArray()) ?? EMPTY;
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? EMPTY;
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? EMPTY;
  const activities = useLiveQuery(() => db.activities.orderBy("createdAt").reverse().limit(10).toArray()) ?? EMPTY;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const today = useSyncExternalStore(subscribeToday, getLocalToday, () => "");
  const todayDate = today ? new Date(`${today}T12:00:00`) : null;
  const todayTasks = tasks.filter((task) => task.scheduledDate === today);
  const completedToday = todayTasks.filter((task) => task.isCompleted).length;
  const progress = todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0;
  const projects = notes.filter((note) => note.isProject && note.status !== "done" && note.status !== "archived");
  const inbox = notes.filter((note) => note.status === "inbox");
  const wordCount = notes.reduce((total, note) => total + note.content.trim().split(/\s+/).filter(Boolean).length, 0);
  const linkCount = notes.reduce((total, note) => total + (note.content.match(/\[\[[^\]]+\]\]/g)?.length ?? 0), 0);

  async function addTodayTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !today) return;
    try {
      await createTask({ text, scheduledDate: today });
      setDraft("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’ajouter la tâche.");
    }
  }

  async function openTodayJournal() {
    if (!today) return;
    try {
      await getOrCreateDailyNote(today);
      onNavigate("today");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’ouvrir le journal.");
    }
  }

  return (
    <div className="dashboard-view">
      <header className="dashboard-hero ambient-glow">
        <div className="flex items-start gap-3">
          <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} />
          <div>
            <p className="collection-kicker">TABLEAU DE BORD · {formatReadableToday(today)}</p>
            <h1>Bonjour, <span>votre QG est prêt.</span></h1>
          </div>
        </div>
        <button type="button" className="dashboard-journal-shortcut" onClick={() => void openTodayJournal()}>
          <CalendarDays size={15} /><span>Journal du jour</span><ArrowRight size={14} />
        </button>
      </header>

      {error ? <p className="dashboard-error" role="alert">{error}</p> : null}

      <section className="dashboard-kpis" aria-label="Indicateurs clés">
        <KpiCard icon={<Check size={16} />} label="Tâches du jour" value={`${completedToday} / ${todayTasks.length}`} detail={`${progress}% accompli`}>
          <div className="dashboard-progress"><span style={{ width: `${progress}%` }} /></div>
        </KpiCard>
        <KpiCard icon={<FolderKanban size={16} />} label="Projets actifs" value={String(projects.length)} detail={`${averageProjectProgress(projects, tasks)}% moyen`}>
          <div className="dashboard-progress"><span style={{ width: `${averageProjectProgress(projects, tasks)}%` }} /></div>
        </KpiCard>
        <button type="button" className="dashboard-kpi-button" onClick={() => onNavigate("inbox")}>
          <KpiCard icon={<Inbox size={16} />} label="Inbox à trier" value={String(inbox.length)} detail="Idées en attente" />
        </button>
        <KpiCard icon={<Network size={16} />} label="Base de connaissances" value={String(notes.length)} detail={`${wordCount.toLocaleString("fr-FR")} mots · ${linkCount} liens`} />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-main-column">
          <section className="bento-card dashboard-focus">
            <header className="dashboard-section-header">
              <div><p className="collection-kicker">AUJOURD’HUI</p><h2>Focus du jour</h2></div>
              <button type="button" onClick={() => onNavigate("week")}>Semainier <ArrowRight size={13} /></button>
            </header>
            <form className="dashboard-task-form" onSubmit={(event) => void addTodayTask(event)}>
              <Plus size={14} />
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ajouter une tâche pour aujourd’hui" aria-label="Nouvelle tâche du jour" />
            </form>
            <div className="dashboard-focus-list">
              {todayTasks.length ? todayTasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className={`dashboard-task-row ${task.isCompleted ? "dashboard-task-row-complete" : ""}`}
                  onClick={() => void toggleTaskCompletion(task.id).catch((caught: unknown) => {
                    setError(caught instanceof Error ? caught.message : "Impossible de mettre à jour la tâche.");
                  })}
                >
                  <span className="dashboard-task-check">{task.isCompleted ? <Check size={12} /> : null}</span>
                  <span>{task.text}</span>
                </button>
              )) : <p className="dashboard-empty">Aucune tâche planifiée aujourd’hui.</p>}
            </div>
          </section>

          <section className="bento-card dashboard-projects">
            <header className="dashboard-section-header">
              <div><p className="collection-kicker">EN COURS</p><h2>Projets actifs</h2></div>
              <button type="button" onClick={() => onNavigate("projects")}>Tous <ArrowRight size={13} /></button>
            </header>
            <div className="dashboard-project-grid">
              {projects.slice(0, 4).map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  tasks={tasks}
                  categories={categories}
                  onOpen={() => onOpenNote(project.id)}
                />
              ))}
              {!projects.length ? <p className="dashboard-empty">Aucun projet actif pour le moment.</p> : null}
            </div>
          </section>

          <section className="bento-card dashboard-categories">
            <header className="dashboard-section-header">
              <div><p className="collection-kicker">CONNAISSANCE</p><h2>Répartition par catégorie</h2></div>
            </header>
            <CategoryDistribution notes={notes} categories={categories} onNavigate={onNavigate} />
          </section>
        </div>

        <aside className="dashboard-side-column">
          <button type="button" className="bento-card dashboard-daily-card ambient-glow" onClick={() => void openTodayJournal()}>
            <span className="dashboard-daily-date"><strong>{todayDate?.getDate() ?? "—"}</strong><small>{todayDate?.toLocaleDateString("fr-FR", { month: "short" }) ?? "Jour"}</small></span>
            <span><small>PRISE DE NOTE</small><strong>Ouvrir le journal</strong></span>
            <ArrowRight size={16} />
          </button>

          <section className="bento-card dashboard-activity">
            <header className="dashboard-section-header">
              <div><p className="collection-kicker">RÉCENT</p><h2>Activité</h2></div>
              <button type="button" onClick={() => onNavigate("history")}>Voir tout</button>
            </header>
            <div className="dashboard-activity-list">
              {activities.slice(0, 10).map((activity) => (
                <button
                  type="button"
                  key={activity.id}
                  className="dashboard-activity-row"
                  onClick={() => activity.entityId && onOpenNote(activity.entityId)}
                >
                  <span className="dashboard-activity-icon"><ActivityIcon type={activity.type} /></span>
                  <span><strong>{activity.entityTitle}</strong><small>{activity.details ?? activityTypeLabel(activity.type)}</small></span>
                  <time>{relativeTime(activity.createdAt)}</time>
                </button>
              ))}
              {!activities.length ? <p className="dashboard-empty">Les prochaines actions apparaîtront ici.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function KpiCard({ icon, label, value, detail, children }: { icon: React.ReactNode; label: string; value: string; detail: string; children?: React.ReactNode }) {
  return (
    <article className="bento-card dashboard-kpi-card">
      <header><span>{icon}</span><p>{label}</p></header>
      <strong>{value}</strong>
      <small>{detail}</small>
      {children}
    </article>
  );
}

function ProjectCard({ project, tasks, categories, onOpen }: { project: Note; tasks: TaskItem[]; categories: Category[]; onOpen: () => void }) {
  const linked = tasks.filter((task) => task.noteId === project.id);
  const progress = linked.length ? Math.round((linked.filter((task) => task.isCompleted).length / linked.length) * 100) : 0;
  const category = categories.find((item) => item.id === project.categoryId);
  return (
    <button type="button" className="bento-card dashboard-project-card" onClick={onOpen}>
      <span className="dashboard-project-category"><i style={{ backgroundColor: category?.color ?? "#52525B" }} />{category?.name ?? "Sans catégorie"}</span>
      <strong>{project.title || "Sans titre"}</strong>
      <span className="dashboard-project-progress"><span style={{ width: `${progress}%` }} /></span>
      <small>{progress}% · {linked.length} tâche{linked.length === 1 ? "" : "s"}</small>
    </button>
  );
}

function CategoryDistribution({ notes, categories, onNavigate }: { notes: Note[]; categories: Category[]; onNavigate: (view: string) => void }) {
  const data = categories.map((category) => ({ category, count: notes.filter((note) => note.categoryId === category.id).length })).sort((a, b) => b.count - a.count);
  const maximum = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="dashboard-category-bars">
      {data.map(({ category, count }) => (
        <button type="button" key={category.id} onClick={() => onNavigate(`category:${category.id}`)}>
          <span><i style={{ backgroundColor: category.color }} />{category.name}</span>
          <span className="dashboard-category-track"><i style={{ width: `${(count / maximum) * 100}%`, backgroundColor: category.color }} /></span>
          <strong>{count}</strong>
        </button>
      ))}
      {!data.length ? <p className="dashboard-empty">Créez une catégorie dans les Paramètres.</p> : null}
    </div>
  );
}

function ActivityIcon({ type }: { type: ActivityLog["type"] }) {
  if (type === "task_completed") return <Check size={12} />;
  if (type === "project_promoted") return <FolderKanban size={12} />;
  if (type === "ai_applied") return <Sparkles size={12} />;
  if (type === "backup_sync") return <Network size={12} />;
  return <Inbox size={12} />;
}

function activityTypeLabel(type: ActivityLog["type"]): string {
  const labels: Record<ActivityLog["type"], string> = {
    note_created: "Note créée",
    note_updated: "Note mise à jour",
    note_deleted: "Note supprimée",
    task_completed: "Tâche mise à jour",
    project_promoted: "Projet promu",
    ai_applied: "Modification IA appliquée",
    backup_sync: "Sauvegarde ou import",
  };
  return labels[type];
}

function averageProjectProgress(projects: Note[], tasks: TaskItem[]): number {
  if (!projects.length) return 0;
  const values = projects.map((project) => {
    const linked = tasks.filter((task) => task.noteId === project.id);
    return linked.length ? (linked.filter((task) => task.isCompleted).length / linked.length) * 100 : 0;
  });
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function getLocalToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function subscribeToday(): () => void {
  return () => undefined;
}

function formatReadableToday(today: string): string {
  if (!today) return "Aujourd’hui";
  return new Date(`${today}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function relativeTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
