"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, ListTree } from "lucide-react";
import { db } from "@/lib/db/dexie";
import type { Note } from "@/types/models";
import type { OutlineHeading } from "./NoteEditor";

interface OutlineAndBacklinksProps {
  note: Note | null;
  headings: OutlineHeading[];
  section: "contents" | "backlinks";
  onSelectHeading: (position: number) => void;
  onOpenNote: (id: string) => void;
}

export function OutlineAndBacklinks({ note, headings, section, onSelectHeading, onOpenNote }: OutlineAndBacklinksProps) {
  const notes = useLiveQuery(() => db.notes.toArray(), [note?.id, note?.title]) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const backlinks = note
    ? notes.flatMap((source) => {
        if (source.id === note.id) return [];
        const content = source.content.toLocaleLowerCase();
        const match = content.indexOf(`[[${note.title.toLocaleLowerCase()}]]`);
        if (match < 0) return [];
        const start = Math.max(0, match - 58);
        const end = Math.min(source.content.length, match + note.title.length + 62);
        return [{
          source,
          excerpt: `${start > 0 ? "…" : ""}${source.content.slice(start, end).replace(/\s+/g, " ")}${end < source.content.length ? "…" : ""}`,
        }];
      })
    : [];

  return (
    <div className="outline-backlinks">
      {section === "contents" ? <section>
        <div className="context-section-heading">
          <ListTree size={14} />
          <span>Dans cette note</span>
          <span className="context-count">{headings.length}</span>
        </div>
        {headings.length ? (
          <nav className="outline-list" aria-label="Table des matières">
            {headings.map((heading, index) => (
              <button
                type="button"
                key={`${heading.position}-${index}`}
                style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
                onClick={() => onSelectHeading(heading.position)}
                className="outline-item"
              >
                <span className="outline-marker">H{heading.level}</span>
                <span className="truncate">{heading.text || "Titre sans texte"}</span>
              </button>
            ))}
          </nav>
        ) : (
          <p className="context-empty">Les titres H1–H3 s’afficheront ici.</p>
        )}
      </section> : null}

      {section === "backlinks" ? <section className="backlinks-section">
        <div className="context-section-heading">
          <ArrowUpRight size={14} />
          <span>Liens entrants</span>
          <span className="context-count">{backlinks.length}</span>
        </div>
        {backlinks.length ? (
          <div className="backlink-list">
            {backlinks.map(({ source, excerpt }) => {
              const category = categories.find((item) => item.id === source.categoryId);
              return (
                <button type="button" className="backlink-card" key={source.id} onClick={() => onOpenNote(source.id)}>
                  <span className="backlink-title">{source.title || "Sans titre"}</span>
                  {category ? (
                    <span className="backlink-category">
                      <i style={{ backgroundColor: category.color }} />{category.name}
                    </span>
                  ) : null}
                  <span className="backlink-excerpt">{excerpt}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="context-empty">{note ? "Aucune note ne fait référence à celle-ci." : "Sélectionnez une note."}</p>
        )}
      </section> : null}
    </div>
  );
}
