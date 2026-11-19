"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, ChevronDown, CircleDot, Plus, Rows3, Table2, PanelsTopLeft } from "lucide-react";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { createNote } from "@/lib/db/repositories";
import type { Category, Note, NoteStatus, PriorityLevel, TaskItem } from "@/types/models";

const EMPTY_NOTES: Note[] = [];
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_TASKS: TaskItem[] = [];

type ProjectViewMode = "grid" | "table" | "list";
type SortKey = "title" | "category" | "status" | "priority" | "progress" | "date" | "updated";
type SortDirection = "asc" | "desc";

interface ProjectsViewProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onOpenNote: (id: string) => void;
}

interface ProjectData {
  note: Note;
  categoryName: string;
  categoryColor: string;
  completed: number;
  total: number;
  subnotes: number;
  targetDate: string;
}

const statuses: Array<{ value: NoteStatus | "all"; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "active", label: "En cours" },
  { value: "waiting", label: "En attente" },
  { value: "done", label: "Terminé" },
];

const statusNames: Record<NoteStatus, string> = {
  inbox: "Inbox", draft: "Brouillon", active: "En cours", waiting: "En attente", done: "Terminé", archived: "Archivé",
};
const priorityNames: Record<PriorityLevel, string> = { low: "Basse", medium: "Normale", high: "Haute" };

export function ProjectsView({ leftOpen, onToggleLeft, onOpenNote }: ProjectsViewProps) {
  const [mode, setMode] = useState<ProjectViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState<NoteStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const notes = useLiveQuery(() => db.notes.toArray()) ?? EMPTY_NOTES;
  const categories = useLiveQuery(() => db.categories.toArray()) ?? EMPTY_CATEGORIES;
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? EMPTY_TASKS;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem("pkm-project-view");
      if (stored === "grid" || stored === "table" || stored === "list") setMode(stored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const projects = useMemo(() => {
    return notes.filter((note) => note.isProject)
      .filter((note) => statusFilter === "all" || note.status === statusFilter)
      .filter((note) => !categoryFilter || note.categoryId === categoryFilter)
      .map((note) => {
        const category = categories.find((item) => item.id === note.categoryId);
        const linkedTasks = tasks.filter((task) => task.noteId === note.id);
        const target = note.customFields.targetDate;
        return {
          note,
          categoryName: category?.name ?? "Sans catégorie",
          categoryColor: category?.color ?? "#52525B",
          completed: linkedTasks.filter((task) => task.isCompleted).length,
          total: linkedTasks.length,
          subnotes: notes.filter((child) => child.parentId === note.id).length,
          targetDate: typeof target === "string" ? target : "",
        } satisfies ProjectData;
      });
  }, [notes, categories, tasks, statusFilter, categoryFilter]);

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const left = getSortValue(a, sortKey);
    const right = getSortValue(b, sortKey);
    return typeof left === "number" && typeof right === "number"
      ? (left - right) * direction
      : String(left).localeCompare(String(right), "fr", { sensitivity: "base" }) * direction;
  }), [projects, sortKey, sortDirection]);

  async function addProject() {
    setError("");
    try {
      const note = await createNote({ title: "Nouveau projet", isProject: true, status: "active" });
      onOpenNote(note.id);
    } catch {
      setError("Le projet n’a pas pu être créé.");
    }
  }

  function setView(next: ProjectViewMode) {
    setMode(next);
    window.localStorage.setItem("pkm-project-view", next);
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return (
    <div className="collection-view projects-view">
      <header className="collection-header projects-header">
        <div className="flex items-start gap-3">
          <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} />
          <div>
            <p className="collection-kicker">ESPACE DE TRAVAIL · {String(projects.length).padStart(2, "0")}</p>
            <h1>Projets</h1>
            <p className="collection-description">Un aperçu du travail en cours et de ses prochaines étapes.</p>
          </div>
        </div>
        <button type="button" className="project-create-button" onClick={() => void addProject()}><Plus size={15} /> Nouveau Projet</button>
      </header>

      <div className="projects-toolbar">
        <div className="project-filters" role="group" aria-label="Filtrer par statut">
          {statuses.map((status) => (
            <button type="button" key={status.value} className={statusFilter === status.value ? "project-filter-active" : ""} onClick={() => setStatusFilter(status.value)}>
              {status.label}
            </button>
          ))}
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrer par catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
        <div className="project-view-switch" role="group" aria-label="Mode d’affichage">
          <button type="button" aria-label="Vue grille" title="Vue grille" className={mode === "grid" ? "view-mode-active" : ""} onClick={() => setView("grid")}><PanelsTopLeft size={15} /></button>
          <button type="button" aria-label="Vue tableau" title="Vue tableau" className={mode === "table" ? "view-mode-active" : ""} onClick={() => setView("table")}><Table2 size={15} /></button>
          <button type="button" aria-label="Vue liste" title="Vue liste" className={mode === "list" ? "view-mode-active" : ""} onClick={() => setView("list")}><Rows3 size={15} /></button>
        </div>
      </div>

      {error ? <p className="collection-error" role="alert">{error}</p> : null}
      {!sortedProjects.length ? (
        <div className="collection-empty">
          <div className="empty-glyph"><CircleDot size={19} /></div>
          <h2>Aucun projet dans cette vue</h2>
          <p>Promouvez une note ou créez un projet pour commencer.</p>
        </div>
      ) : mode === "grid" ? (
        <div className="project-grid">
          {sortedProjects.map((project, index) => (
            <ProjectCard key={project.note.id} project={project} index={index} onClick={() => onOpenNote(project.note.id)} />
          ))}
        </div>
      ) : mode === "table" ? (
        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <SortHeader label="Projet" sortKey="title" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Catégorie" sortKey="category" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Statut" sortKey="status" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Priorité" sortKey="priority" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Tâches" sortKey="progress" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Date cible" sortKey="date" active={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Mise à jour" sortKey="updated" active={sortKey} direction={sortDirection} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => (
                <tr key={project.note.id} onClick={() => onOpenNote(project.note.id)}>
                  <td className="project-title-cell">{project.note.title}</td>
                  <td><span className="inbox-category"><i style={{ backgroundColor: project.categoryColor }} />{project.categoryName}</span></td>
                  <td><span className={`project-status status-${project.note.status}`}>{statusNames[project.note.status]}</span></td>
                  <td>{priorityNames[project.note.priority]}</td>
                  <td>{project.completed}/{project.total}</td>
                  <td>{formatDate(project.targetDate)}</td>
                  <td>{formatDate(new Date(project.note.updatedAt).toISOString().slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="project-list">
          {sortedProjects.map((project) => (
            <button type="button" className="project-list-row" key={project.note.id} onClick={() => onOpenNote(project.note.id)}>
              <i className="project-color-dot" style={{ backgroundColor: project.categoryColor }} />
              <strong>{project.note.title}</strong>
              <span className={`project-status status-${project.note.status}`}>{statusNames[project.note.status]}</span>
              <span className="project-list-progress"><Progress project={project} /></span>
              <small>{project.completed}/{project.total} tâches</small>
              <small>{project.subnotes} sous-notes</small>
              <ChevronDown size={14} className="project-list-arrow" />
            </button>
          ))}
        </div>
      )}
      <p className="projects-footer-note">Vue enregistrée <span>·</span> {mode === "table" ? "Tri par colonne" : mode === "grid" ? "Cartes" : "Liste compacte"}</p>
    </div>
  );
}

function ProjectCard({ project, index, onClick }: { project: ProjectData; index: number; onClick: () => void }) {
  const percentage = project.total ? Math.round((project.completed / project.total) * 100) : 0;
  return (
    <button type="button" className={`project-card bento-card ${index === 0 ? "ambient-glow" : ""}`} style={{ animationDelay: `${index * 45}ms` }} onClick={onClick}>
      <span className="project-card-top">
        <span className="inbox-category"><i style={{ backgroundColor: project.categoryColor }} />{project.categoryName}</span>
        <span className={`project-status status-${project.note.status}`}>{statusNames[project.note.status]}</span>
      </span>
      <strong className="project-card-title">{project.note.title || "Sans titre"}</strong>
      <span className="project-card-summary">{project.note.summary || project.note.content.replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").slice(0, 100) || "Aucune description pour le moment."}</span>
      <span className="project-card-progress-label"><span>Avancement</span><strong>{project.total ? `${percentage}%` : "Aucune tâche"}</strong></span>
      <Progress project={project} />
      <span className="project-card-footer">
        <span>{priorityNames[project.note.priority]} · {project.subnotes} sous-notes</span>
        {project.targetDate ? <span><CalendarClock size={12} />{formatDate(project.targetDate)}</span> : null}
      </span>
    </button>
  );
}

function Progress({ project }: { project: ProjectData }) {
  const percentage = project.total ? Math.round((project.completed / project.total) * 100) : 0;
  return (
    <span className="project-progress" aria-label={`${percentage}% des tâches terminées`}>
      <span style={{ width: `${percentage}%` }} />
    </span>
  );
}

function SortHeader({ label, sortKey, active, direction, onSort }: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th>
      <button type="button" onClick={() => onSort(sortKey)}>
        {label}
        {isActive ? direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
      </button>
    </th>
  );
}

function getSortValue(project: ProjectData, key: SortKey): string | number {
  switch (key) {
    case "title": return project.note.title;
    case "category": return project.categoryName;
    case "status": return project.note.status;
    case "priority": return project.note.priority;
    case "progress": return project.total ? project.completed / project.total : 0;
    case "date": return project.targetDate;
    case "updated": return project.note.updatedAt;
  }
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
