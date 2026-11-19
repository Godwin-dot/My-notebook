"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { History, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/db/dexie";
import { restoreNoteSnapshot } from "@/lib/db/repositories";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { Note, NoteSnapshot } from "@/types/models";

export function NoteHistoryModal({ note, open, onClose }: { note: Note | null; open: boolean; onClose: () => void }) {
  const snapshots = useLiveQuery(
    () => note ? db.snapshots.where("noteId").equals(note.id).reverse().sortBy("createdAt") : Promise.resolve([] as NoteSnapshot[]),
    [note?.id],
  ) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const confirm = useConfirm();
  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  async function restore(snapshot: NoteSnapshot) {
    const confirmed = await confirm({
      title: "Restaurer cette version ?",
      description: `La version du ${formatSnapshotDate(snapshot.createdAt)} remplacera le titre et le contenu actuels. L’état actuel sera conservé dans l’historique.`,
      confirmLabel: "Restaurer",
      destructive: false,
    });
    if (!confirmed) return;
    try {
      await restoreNoteSnapshot(snapshot.id);
      setError("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de restaurer cette version.");
    }
  }

  if (!open) return null;
  return (
    <div className="note-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="note-history-modal bento-card" role="dialog" aria-modal="true" aria-label="Historique de la note">
        <header className="note-history-header">
          <div><span><History size={15} /></span><div><p className="collection-kicker">SNAPSHOTS LOCAUX</p><h2>{note?.title || "Note"}</h2></div></div>
          <button type="button" aria-label="Fermer" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="note-history-layout">
          <aside className="note-history-list">
            {snapshots.map((snapshot) => (
              <button type="button" key={snapshot.id} className={selected?.id === snapshot.id ? "note-history-item-active" : ""} onClick={() => setSelectedId(snapshot.id)}>
                <strong>{formatSnapshotDate(snapshot.createdAt)}</strong>
                <span>{snapshotReasonLabel(snapshot.reason)}</span>
              </button>
            ))}
            {!snapshots.length ? <p className="dashboard-empty">Aucune version enregistrée pour cette note.</p> : null}
          </aside>
          <div className="note-history-preview">
            {selected ? (
              <>
                <pre>{selected.content || "Contenu vide"}</pre>
                <button type="button" className="note-history-restore" onClick={() => void restore(selected)}><RotateCcw size={13} /> Restaurer cette version</button>
              </>
            ) : <p className="dashboard-empty">Sélectionnez une version pour la prévisualiser.</p>}
          </div>
        </div>
        {error ? <p className="dashboard-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}

function snapshotReasonLabel(reason: NoteSnapshot["reason"]): string {
  if (reason === "before_ai") return "Avant IA";
  if (reason === "manual_restore") return "Restauration";
  return "Auto";
}

function formatSnapshotDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
