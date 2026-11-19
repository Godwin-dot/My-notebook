"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Circle, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { createNote } from "@/lib/db/repositories";
import type { Note } from "@/types/models";

interface ProjectDetailsProps {
  project: Note;
  onOpenNote: (id: string) => void;
}

export function ProjectDetails({ project, onOpenNote }: ProjectDetailsProps) {
  const [error, setError] = useState("");
  const subnotes = useLiveQuery(
    () => db.notes.where("parentId").equals(project.id).sortBy("updatedAt").then((items) => items.reverse()),
    [project.id],
  ) ?? [];
  const tasks = useLiveQuery(
    () => db.tasks.where("noteId").equals(project.id).sortBy("order"),
    [project.id],
  ) ?? [];
  const completed = tasks.filter((task) => task.isCompleted).length;
  const percentage = tasks.length ? Math.round(completed / tasks.length * 100) : 0;

  async function addSubnote() {
    setError("");
    try {
      const note = await createNote({
        title: "Sous-note",
        parentId: project.id,
        categoryId: project.categoryId,
        status: "draft",
      });
      onOpenNote(note.id);
    } catch {
      setError("La sous-note n’a pas pu être créée.");
    }
  }

  return (
    <section className="project-details">
      <header className="project-details-header">
        <div>
          <p className="collection-kicker">PROJET</p>
          <h2>Suivi & sous-notes</h2>
        </div>
        <button type="button" className="project-subnote-add" onClick={() => void addSubnote()}>
          <Plus size={13} /> Ajouter une sous-note
        </button>
      </header>
      <div className="project-details-progress">
        <span className="project-details-progress-title">Tâches terminées</span>
        <span className="project-details-progress-count">{completed} / {tasks.length}</span>
        <span className="project-progress"><span style={{ width: `${percentage}%` }} /></span>
        <span className="project-details-progress-percent">{tasks.length ? `${percentage}%` : "Aucune tâche"}</span>
      </div>
      {subnotes.length ? (
        <div className="project-subnotes">
          {subnotes.map((subnote) => (
            <button type="button" key={subnote.id} className="project-subnote" onClick={() => onOpenNote(subnote.id)}>
              <ArrowUpRight size={13} />
              <span>{subnote.title || "Sans titre"}</span>
              <span className={`project-status status-${subnote.status}`}>{subnote.status}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="project-details-empty">Aucune sous-note liée à ce projet.</p>
      )}
      {tasks.length ? (
        <div className="project-task-preview">
          {tasks.slice(0, 3).map((task) => (
            <span key={task.id} className={task.isCompleted ? "project-task-completed" : ""}>
              {task.isCompleted ? <CheckCircle2 size={13} /> : <Circle size={13} />}{task.text}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="collection-error" role="alert">{error}</p> : null}
    </section>
  );
}
