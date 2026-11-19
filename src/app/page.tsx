"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { LeftSidebar, useLeftSidebar } from "@/components/layout/LeftSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { RightPanel } from "@/components/layout/RightPanel";
import { TopBar } from "@/components/layout/TopBar";
import { db } from "@/lib/db/dexie";
import { createNote, deleteNote, getOrCreateDailyNote, promoteToProject, updateNote } from "@/lib/db/repositories";
import { PropertiesBar } from "@/modules/editor/components/PropertiesBar";
import { NoteEditor, type OutlineHeading } from "@/modules/editor/components/NoteEditor";
import { InboxView } from "@/modules/inbox-projects/components/InboxView";
import { ProjectsView } from "@/modules/inbox-projects/components/ProjectsView";
import { ProjectDetails } from "@/modules/inbox-projects/components/ProjectDetails";
import { DailyJournalView } from "@/modules/daily-journal/components/DailyJournalView";
import { WeeklyPlannerView } from "@/modules/weekly-planner/components/WeeklyPlannerView";
import { SettingsView } from "@/modules/settings/components/SettingsView";
import { DashboardView } from "@/modules/dashboard/components/DashboardView";
import { HistoryView } from "@/modules/history/components/HistoryView";
import { NoteHistoryModal } from "@/modules/history/components/NoteHistoryModal";
import { ImportFolderModal } from "@/modules/folder-sync/components/ImportFolderModal";
import { aiService, type AIClassificationResult } from "@/modules/ai-copilot/services/ai-service";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { logActivity, saveNoteSnapshot } from "@/lib/db/repositories";
import type { Note } from "@/types/models";

const EMPTY_NOTES: Note[] = [];

export default function Home() {
  const [leftOpen, toggleLeft] = useLeftSidebar();
  const [rightOpen, setRightOpen] = useState(true);
  const [activeView, setActiveView] = useState("dashboard");
  const [dailyDate, setDailyDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [linkError, setLinkError] = useState("");
  const [noteUpdateError, setNoteUpdateError] = useState(false);
  const [importFolderOpen, setImportFolderOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"tools" | "contents" | "backlinks" | "ai">("tools");
  const [classification, setClassification] = useState<AIClassificationResult | null>(null);
  const [classificationLoading, setClassificationLoading] = useState(false);
  const [classificationError, setClassificationError] = useState("");
  const classificationRequestId = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirm = useConfirm();

  const liveNotes = useLiveQuery(async () => {
    const all = await db.notes.reverse().sortBy("updatedAt");
    return all;
  });
  const notes = liveNotes ?? EMPTY_NOTES;
  const settings = useLiveQuery(() => db.settings.get("default"));
  const clearClassification = useCallback(() => {
    classificationRequestId.current += 1;
    setClassification(null);
    setClassificationError("");
    setClassificationLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedRight = window.localStorage.getItem("pkm-right-open");
      if (window.innerWidth < 1024) {
        setRightOpen(false);
        return;
      }
      setRightOpen(savedRight === null ? window.innerWidth > 1100 : savedRight === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleWikilink = (event: Event) => {
      const title = (event as CustomEvent<string>).detail;
      clearClassification();
      void db.notes.toArray()
        .then((allNotes) => allNotes.find((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase()))
        .then((target) => target ?? createNote({ title, status: "inbox" }))
        .then((target) => {
          setLinkError("");
          setSelectedId(target.id);
        })
        .catch(() => setLinkError(`Impossible de créer la note « ${title} ».`));
    };
    const handleCreateWikilink = (event: Event) => {
      const title = (event as CustomEvent<string>).detail;
      void db.notes.toArray()
        .then((allNotes) => allNotes.some((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase()))
        .then((exists) => exists ? undefined : createNote({ title, status: "inbox" }))
        .then(() => setLinkError(""))
        .catch(() => setLinkError(`Impossible de créer la note « ${title} ».`));
    };
    const handleWikilinkError = () => setLinkError("Impossible de charger les suggestions de liens.");
    const handleNavigate = (event: Event) => {
      const view = (event as CustomEvent<string>).detail;
      clearClassification();
      if (view === "today") setDailyDate(getLocalToday());
      setActiveView(view);
    };
    const handleOpenNote = (event: Event) => {
      clearClassification();
      setSelectedId((event as CustomEvent<string>).detail);
      setActiveView("all");
    };
    const handleCreateNote = () => {
      clearClassification();
      void createNote()
        .then((note) => {
          setSelectedId(note.id);
          setActiveView("all");
        })
        .catch(() => setLinkError("La note n’a pas pu être créée."));
    };
    window.addEventListener("pkm:open-wikilink", handleWikilink);
    window.addEventListener("pkm:create-wikilink", handleCreateWikilink);
    window.addEventListener("pkm:wikilink-error", handleWikilinkError);
    window.addEventListener("pkm:navigate", handleNavigate);
    window.addEventListener("pkm:open-note", handleOpenNote);
    window.addEventListener("pkm:create-note", handleCreateNote);
    return () => {
      window.removeEventListener("pkm:open-wikilink", handleWikilink);
      window.removeEventListener("pkm:create-wikilink", handleCreateWikilink);
      window.removeEventListener("pkm:wikilink-error", handleWikilinkError);
      window.removeEventListener("pkm:navigate", handleNavigate);
      window.removeEventListener("pkm:open-note", handleOpenNote);
      window.removeEventListener("pkm:create-note", handleCreateNote);
    };
  }, [clearClassification]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get("view");
      const validViews = new Set(["dashboard", "today", "week", "inbox", "projects", "all", "history", "settings"]);
      if (requestedView && (validViews.has(requestedView) || requestedView.startsWith("category:"))) {
        setActiveView(requestedView);
        if (requestedView === "today") setDailyDate(getLocalToday());
      }
      if (params.get("create") === "1") {
        window.dispatchEvent(new Event("pkm:create-note"));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (activeView !== "today") return;
    let active = true;
    void getOrCreateDailyNote(dailyDate)
      .then((note) => {
        if (active) {
          setSelectedId(note.id);
          setLinkError("");
        }
      })
      .catch(() => {
        if (active) setLinkError("Impossible d’ouvrir le journal de cette date.");
      });
    return () => { active = false; };
  }, [activeView, dailyDate]);

  const selected = useMemo(
    () => activeView === "today"
      ? notes.find((note) => note.isDaily && note.dailyDate === dailyDate) ?? null
      : notes.find((note) => note.id === selectedId) ?? notes[0] ?? null,
    [activeView, dailyDate, notes, selectedId],
  );

  const visibleNotes = useMemo(() => {
    if (activeView === "inbox") return notes.filter((note) => note.status === "inbox");
    if (activeView === "projects") return notes.filter((note) => note.isProject);
    if (activeView === "today") return notes.filter((note) => note.isDaily);
    if (activeView.startsWith("category:")) {
      const categoryId = activeView.slice("category:".length);
      return notes.filter((note) => note.categoryId === categoryId);
    }
    return notes;
  }, [activeView, notes]);

  const filteredNotes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visibleNotes;
    return visibleNotes.filter((note) =>
      `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(normalized),
    );
  }, [query, visibleNotes]);

  async function handleCreate() {
    const note = await createNote();
    setSelectedId(note.id);
    setActiveView("all");
  }

  async function handleUpdate(changes: Partial<Note>) {
    if (!selected) return;
    setNoteUpdateError(false);
    try {
      await updateNote(selected.id, changes);
    } catch {
      setNoteUpdateError(true);
    }
  }

  async function applyDailyReview(noteId: string, sourceContent: string, content: string): Promise<void> {
    try {
      const dailyNote = await db.notes.get(noteId);
      if (!dailyNote || dailyNote.content !== sourceContent) {
        throw new Error("Le journal a changé depuis la génération. Relancez le bilan.");
      }
      await saveNoteSnapshot(dailyNote.id, dailyNote.title, dailyNote.content, "before_ai");
      await updateNote(dailyNote.id, { content });
      await logActivity({
        type: "ai_applied",
        entityId: dailyNote.id,
        entityTitle: dailyNote.title,
        details: "Bilan quotidien IA appliqué",
      });
    } catch (caught) {
      setNoteUpdateError(true);
      throw new Error(caught instanceof Error ? caught.message : "Le bilan n’a pas pu être enregistré localement.");
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const confirmed = await confirm({
      title: "Supprimer cette note ?",
      description: `« ${selected.title || "Sans titre"} » et ses tâches liées seront définitivement supprimés de cet appareil.`,
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!confirmed) return;
    clearClassification();
    await deleteNote(selected.id);
    setSelectedId(null);
  }

  function openNoteInEditor(id: string) {
    clearClassification();
    setSelectedId(id);
    setActiveView("all");
  }

  function selectView(view: string) {
    clearClassification();
    if (view === "today") setDailyDate(getLocalToday());
    setActiveView(view);
  }

  async function toggleProject() {
    if (!selected) return;
    if (selected.isProject) {
      await handleUpdate({ isProject: false });
    } else {
      try {
        await promoteToProject(selected.id);
      } catch {
        setNoteUpdateError(true);
      }
    }
  }

  async function classifySelectedNote() {
    if (!selected || !settings) return;
    aiService.setSettings(settings);
    const requestId = ++classificationRequestId.current;
    setClassification(null);
    setClassificationError("");
    setClassificationLoading(true);
    try {
      const [categories, allNotes] = await Promise.all([db.categories.toArray(), db.notes.toArray()]);
      const result = await aiService.classifyNote(selected, categories, allNotes.map((note) => note.title).filter(Boolean));
      if (requestId === classificationRequestId.current) setClassification(result);
    } catch (caught) {
      if (requestId === classificationRequestId.current) {
        setClassificationError(caught instanceof Error ? caught.message : "Le classement IA a échoué.");
      }
    } finally {
      if (requestId === classificationRequestId.current) setClassificationLoading(false);
    }
  }

  async function applyClassification(includeLinks: boolean) {
    if (!selected || !classification) return;
    await saveNoteSnapshot(selected.id, selected.title, selected.content, "before_ai");
    const newLinks = includeLinks
      ? classification.suggestedLinks.filter((title) => !selected.content.includes(`[[${title}]]`))
      : [];
    const content = newLinks.length
      ? `${selected.content.trim()}${selected.content.trim() ? "\n\n" : ""}${newLinks.map((title) => `[[${title}]]`).join(" ")}`
      : selected.content;
    try {
      await updateNote(selected.id, {
        categoryId: classification.suggestedCategoryId,
        tags: classification.suggestedTags,
        summary: classification.summary,
        content,
      });
      await logActivity({
        type: "ai_applied",
        entityId: selected.id,
        entityTitle: selected.title,
        details: "Classement IA appliqué",
      });
      setClassification(null);
      setClassificationError("");
    } catch {
      setClassificationError("La proposition n’a pas pu être appliquée à cette note.");
    }
  }

  function toggleRight() {
    setRightOpen((open) => {
      window.localStorage.setItem("pkm-right-open", String(!open));
      return !open;
    });
  }

  function closeRight() {
    setRightOpen(false);
    window.localStorage.setItem("pkm-right-open", "false");
  }

  function openMobileMenu() {
    closeRight();
    window.dispatchEvent(new Event("pkm:open-left-sidebar"));
  }

  function openQuickCapture() {
    closeRight();
    window.dispatchEvent(new Event("pkm:open-capture"));
  }

  return (
    <AppShell>
      <main className="flex h-full min-h-0 overflow-hidden">
        <LeftSidebar
          open={leftOpen}
          onToggle={toggleLeft}
          onCreate={() => void handleCreate()}
          onSelect={selectView}
          onImportFolder={() => setImportFolderOpen(true)}
          activeView={activeView}
        />

        <section className="editor-shell flex min-w-0 flex-1">
          {activeView === "dashboard" ? (
            <DashboardView
              leftOpen={leftOpen}
              onToggleLeft={toggleLeft}
              onNavigate={selectView}
              onOpenNote={openNoteInEditor}
            />
          ) : null}
          {activeView === "history" ? (
            <HistoryView leftOpen={leftOpen} onToggleLeft={toggleLeft} onOpenNote={openNoteInEditor} />
          ) : null}
          {activeView === "settings" ? (
            <SettingsView settings={settings} onImportFolder={() => setImportFolderOpen(true)} leftOpen={leftOpen} onToggleLeft={toggleLeft} />
          ) : null}
          {activeView === "inbox" ? <InboxView leftOpen={leftOpen} onToggleLeft={toggleLeft} onOpenNote={openNoteInEditor} /> : null}
          {activeView === "projects" ? <ProjectsView leftOpen={leftOpen} onToggleLeft={toggleLeft} onOpenNote={openNoteInEditor} /> : null}
          {activeView === "week" ? <WeeklyPlannerView leftOpen={leftOpen} onToggleLeft={toggleLeft} onOpenNote={openNoteInEditor} /> : null}
          {activeView === "today" ? (
            <DailyJournalView
              dateStr={dailyDate}
              note={selected?.isDaily && selected.dailyDate === dailyDate ? selected : null}
              settings={settings}
              updateError={noteUpdateError}
              onDateChange={setDailyDate}
              onNoteChange={handleUpdate}
              onApplyReview={applyDailyReview}
              onOutlineChange={setHeadings}
              leftOpen={leftOpen}
              onToggleLeft={toggleLeft}
              onToggleRight={toggleRight}
              onToggleProject={() => void toggleProject()}
            />
          ) : null}
          {activeView !== "dashboard" && activeView !== "history" && activeView !== "settings" && activeView !== "inbox" && activeView !== "projects" && activeView !== "week" && activeView !== "today" ? <>
          <div className="flex min-w-[240px] w-[280px] flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] max-md:hidden">
            <div className="border-b border-[var(--border-subtle)] p-3">
              <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3">
                <Search size={14} className="text-[var(--text-secondary)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {filteredNotes.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  onClick={() => {
                    clearClassification();
                    setSelectedId(note.id);
                  }}
                  className={`note-row block w-full ${selected?.id === note.id ? "note-row-active" : ""}`}
                >
                  <span className="block truncate text-sm font-medium">{note.title || "Sans titre"}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
                    {note.content.replace(/[#*_]/g, "").slice(0, 70) || "Note vide"}
                  </span>
                </button>
              ))}
              {filteredNotes.length === 0 ? (
                <p className="p-3 text-sm text-[var(--text-secondary)]">Aucune note trouvée.</p>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mobile-note-picker flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 md:hidden">
              <select
                value={selected?.id ?? ""}
                onChange={(event) => {
                  clearClassification();
                  setSelectedId(event.target.value);
                }}
                aria-label="Choisir une note"
                className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                {filteredNotes.length === 0 ? <option value="">Aucune note</option> : null}
                {filteredNotes.map((note) => (
                  <option key={note.id} value={note.id}>{note.title || "Sans titre"}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] text-[var(--accent-color)]"
                aria-label="Créer une note"
              >
                <span className="text-lg leading-none">+</span>
              </button>
            </div>
            <TopBar
              title={selected ? selected.title || "Sans titre" : "Aucune note"}
              leftOpen={leftOpen}
              onToggleLeft={toggleLeft}
              onToggleRight={toggleRight}
              onHistory={() => setHistoryOpen(true)}
              onClassify={() => {
                setRightPanelTab("ai");
                void classifySelectedNote();
              }}
            />
            {selected ? (
              <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-5 pt-6 sm:px-8 sm:pt-8">
                  <div className="flex items-center gap-2">
                    <input
                      value={selected.title}
                      onChange={(event) => void handleUpdate({ title: event.target.value })}
                      className="min-w-0 flex-1 border-none bg-transparent text-3xl font-semibold outline-none"
                      aria-label="Titre de la note"
                    />
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className="icon-button"
                      aria-label="Supprimer la note"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {noteUpdateError ? <p className="text-xs text-red-400">Impossible d’enregistrer les propriétés de cette note.</p> : null}
                  <PropertiesBar note={selected} onChange={handleUpdate} onToggleProject={() => void toggleProject()} />
                </div>
                {selected.isProject ? <ProjectDetails project={selected} onOpenNote={openNoteInEditor} /> : null}
                <NoteEditor
                  key={selected.id}
                  note={selected}
                  settings={settings}
                  onOutlineChange={setHeadings}
                />
                {linkError ? <p className="px-8 pb-3 text-center text-xs text-red-400">{linkError}</p> : null}
              </div>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-[var(--text-secondary)]">
                Créez une note pour commencer.
              </div>
            )}
          </div>
          </> : null}
        </section>

        <RightPanel
          open={rightOpen && activeView !== "dashboard" && activeView !== "history" && activeView !== "settings" && activeView !== "inbox" && activeView !== "projects" && activeView !== "week"}
          note={activeView === "dashboard" || activeView === "history" || activeView === "settings" || activeView === "inbox" || activeView === "projects" || activeView === "week" ? null : selected}
          headings={headings}
          onSelectHeading={(position) => window.dispatchEvent(new CustomEvent<number>("pkm:outline-select", { detail: position }))}
          onOpenNote={openNoteInEditor}
          tab={rightPanelTab}
          onTabChange={setRightPanelTab}
          classification={classification}
          classificationLoading={classificationLoading}
          classificationError={classificationError}
          onClassify={() => void classifySelectedNote()}
          onApplyClassification={(includeLinks) => void applyClassification(includeLinks)}
          onIgnoreClassification={() => {
            classificationRequestId.current += 1;
            setClassification(null);
            setClassificationError("");
            setClassificationLoading(false);
          }}
          onClose={closeRight}
        />
      </main>
      <MobileBottomNav
        activeView={activeView}
        onNavigate={selectView}
        onOpenMenu={openMobileMenu}
        onCapture={openQuickCapture}
      />
      <NoteHistoryModal note={selected} open={historyOpen && Boolean(selected)} onClose={() => setHistoryOpen(false)} />
      {importFolderOpen ? <ImportFolderModal onClose={() => setImportFolderOpen(false)} /> : null}
    </AppShell>
  );
}

function getLocalToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
