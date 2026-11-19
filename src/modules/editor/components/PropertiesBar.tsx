"use client";

import { useState } from "react";
import { BriefcaseBusiness, ChevronDown, ChevronRight, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import type { Note, NoteStatus, PriorityLevel } from "@/types/models";

const statuses: Array<{ value: NoteStatus; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "draft", label: "Brouillon" },
  { value: "active", label: "En cours" },
  { value: "waiting", label: "En attente" },
  { value: "done", label: "Terminé" },
  { value: "archived", label: "Archivé" },
];

const priorities: Array<{ value: PriorityLevel; label: string }> = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Normale" },
  { value: "high", label: "Haute" },
];

interface PropertiesBarProps {
  note: Note;
  onChange: (changes: Partial<Note>) => Promise<void>;
  onToggleProject: () => void;
}

export function PropertiesBar({ note, onChange, onToggleProject }: PropertiesBarProps) {
  const [expanded, setExpanded] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? [];
  const allTags = useLiveQuery(async () => {
    const notes = await db.notes.toArray();
    return [...new Set(notes.flatMap((item) => item.tags))].sort();
  }) ?? [];
  const targetDate = note.customFields.targetDate;
  const activeCategory = categories.find((category) => category.id === note.categoryId);

  async function save(changes: Partial<Note>) {
    setError("");
    try {
      await onChange(changes);
    } catch {
      setError("Impossible d’enregistrer cette propriété.");
    }
  }

  async function addTag(value = tagInput) {
    const tag = value.trim().replace(/^#/, "");
    if (!tag || note.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    await save({ tags: [...note.tags, tag] });
    setTagInput("");
  }

  return (
    <section className="properties-bar" aria-label="Propriétés de la note">
      <div className="properties-header">
        <button type="button" className="properties-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>PROPRIÉTÉS</span>
          <span className="properties-summary">{note.tags.length} tags</span>
          <span className={`property-badge status-${note.status}`}>{statuses.find((status) => status.value === note.status)?.label}</span>
          <span className={`property-badge priority-${note.priority}`}>{priorities.find((priority) => priority.value === note.priority)?.label}</span>
        </button>
        <button type="button" className={`property-project-toggle ${note.isProject ? "property-project-active" : ""}`} onClick={onToggleProject}>
          <BriefcaseBusiness size={12} />{note.isProject ? "Projet" : "Promouvoir en projet"}
        </button>
      </div>
      {expanded ? (
        <div className="properties-grid">
          <label className="property-field">
            <span className="property-label">{activeCategory ? <i style={{ backgroundColor: activeCategory.color }} /> : null}Catégorie</span>
            <select
              value={note.categoryId ?? ""}
              onChange={(event) => void save({ categoryId: event.target.value || null })}
            >
              <option value="">Sans catégorie</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label className="property-field">
            <span>Statut</span>
            <select value={note.status} onChange={(event) => void save({ status: event.target.value as NoteStatus })}>
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>

          <label className="property-field">
            <span>Priorité</span>
            <select value={note.priority} onChange={(event) => void save({ priority: event.target.value as PriorityLevel })}>
              {priorities.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
            </select>
          </label>

          <label className="property-field">
            <span>Date cible</span>
            <input
              type="date"
              value={typeof targetDate === "string" ? targetDate : ""}
              onChange={(event) => void save({ customFields: { ...note.customFields, targetDate: event.target.value || null } })}
            />
          </label>

          <div className="property-field property-tags">
            <span>Tags</span>
            <div className="tag-row">
              {note.tags.map((tag) => (
                <button
                  type="button"
                  className="tag-chip"
                  key={tag}
                  onClick={() => void save({ tags: note.tags.filter((value) => value !== tag) })}
                  aria-label={`Supprimer le tag ${tag}`}
                >
                  {tag}<X size={11} />
                </button>
              ))}
              <input
                list={`tag-options-${note.id}`}
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    void addTag();
                  }
                }}
                placeholder="+ Ajouter"
                aria-label="Ajouter un tag"
              />
              <datalist id={`tag-options-${note.id}`}>
                {allTags.filter((tag) => !note.tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}
              </datalist>
            </div>
          </div>
          {error ? <p className="properties-error">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
