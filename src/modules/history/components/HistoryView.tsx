"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Check, FolderKanban, Inbox, Network, Sparkles, Trash2 } from "lucide-react";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";
import { db } from "@/lib/db/dexie";
import { clearActivityHistory } from "@/lib/db/repositories";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { ActivityLog } from "@/types/models";

type ActivityFilter = "all" | "note" | "task" | "project" | "ai" | "backup";

export function HistoryView({
  leftOpen,
  onToggleLeft,
  onOpenNote,
}: {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onOpenNote: (id: string) => void;
}) {
  const activities = useLiveQuery(() => db.activities.orderBy("createdAt").reverse().toArray()) ?? [];
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const confirm = useConfirm();
  const filtered = activities.filter((activity) => filter === "all" || matchesFilter(activity.type, filter));

  async function clearHistory() {
    const confirmed = await confirm({
      title: "Vider l’historique ?",
      description: "Toutes les entrées d’activité locale seront supprimées. Les snapshots des notes seront conservés.",
      confirmLabel: "Vider l’historique",
      destructive: true,
    });
    if (confirmed) await clearActivityHistory();
  }

  return (
    <section className="history-view">
      <header className="history-header">
        <div className="flex items-start gap-3">
          <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} />
          <div><p className="collection-kicker">JOURNAL LOCAL</p><h1>Historique</h1><p>Actions récentes enregistrées sur cet appareil.</p></div>
        </div>
        <button type="button" className="history-clear-button" onClick={() => void clearHistory()}><Trash2 size={13} /> Vider l’historique</button>
      </header>
      <div className="history-filters" role="group" aria-label="Filtrer l’historique">
        {(["all", "note", "task", "project", "ai", "backup"] as ActivityFilter[]).map((value) => (
          <button type="button" key={value} className={filter === value ? "pill-active" : ""} onClick={() => setFilter(value)}>{filterLabel(value)}</button>
        ))}
      </div>
      <div className="history-timeline bento-card">
        {filtered.map((activity) => (
          <button type="button" key={activity.id} className="history-row" onClick={() => activity.entityId && onOpenNote(activity.entityId)}>
            <span className="history-icon"><HistoryIcon type={activity.type} /></span>
            <span className="history-copy"><strong>{activity.entityTitle}</strong><small>{activity.details ?? historyLabel(activity.type)}</small></span>
            <time>{new Date(activity.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
          </button>
        ))}
        {!filtered.length ? <p className="dashboard-empty">Aucune activité dans cette catégorie.</p> : null}
      </div>
    </section>
  );
}

function matchesFilter(type: ActivityLog["type"], filter: Exclude<ActivityFilter, "all">): boolean {
  if (filter === "note") return type.startsWith("note_");
  if (filter === "task") return type === "task_completed";
  if (filter === "project") return type === "project_promoted";
  if (filter === "ai") return type === "ai_applied";
  return type === "backup_sync";
}

function filterLabel(filter: ActivityFilter): string {
  const labels: Record<ActivityFilter, string> = { all: "Tout", note: "Notes", task: "Tâches", project: "Projets", ai: "IA", backup: "Sauvegardes" };
  return labels[filter];
}

function historyLabel(type: ActivityLog["type"]): string {
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

function HistoryIcon({ type }: { type: ActivityLog["type"] }) {
  if (type === "task_completed") return <Check size={14} />;
  if (type === "project_promoted") return <FolderKanban size={14} />;
  if (type === "ai_applied") return <Sparkles size={14} />;
  if (type === "backup_sync") return <Network size={14} />;
  return <Inbox size={14} />;
}
