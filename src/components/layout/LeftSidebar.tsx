"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, FolderKanban, History, Inbox, LayoutDashboard, Library, PanelLeftClose, Plus, Search, Settings, Upload } from "lucide-react";
import { db } from "@/lib/db/dexie";

interface LeftSidebarProps {
  open: boolean;
  onToggle: () => void;
  onCreate: () => void;
  onSelect: (view: string) => void;
  onImportFolder: () => void;
  activeView: string;
}

const LEFT_SIDEBAR_STORAGE_KEY = "pkm_left_sidebar_open";

export function useLeftSidebar(): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  const interacted = useRef(false);

  const toggle = useCallback(() => {
    interacted.current = true;
    setOpen((current) => {
      const next = !current;
      window.localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let saved = window.localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY);
      if (saved === null) {
        saved = window.localStorage.getItem("pkm-left-open");
        if (saved !== null) window.localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, saved);
      }
      if (!interacted.current) setOpen(saved === null ? window.innerWidth > 760 : saved === "true");
    });
    const handleToggle = () => toggle();
    window.addEventListener("pkm:toggle-left-sidebar", handleToggle);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pkm:toggle-left-sidebar", handleToggle);
    };
  }, [toggle]);

  return [open, toggle];
}

export function LeftSidebar({ open, onToggle, onCreate, onSelect, onImportFolder, activeView }: LeftSidebarProps) {
  const notes = useLiveQuery(() => db.notes.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const settings = useLiveQuery(() => db.settings.get("default"));
  const dailyEnabled = settings?.enabledModules.includes("daily") ?? true;
  const weeklyEnabled = settings?.enabledModules.includes("weekly") ?? true;
  const projectsEnabled = settings?.enabledModules.includes("projects") ?? true;
  const legacyModuleSettings = Boolean(settings && settings.enabledModules.length > 0 && settings.enabledModules.every((id) => ["daily", "weekly", "projects", "ai"].includes(id)));
  const editorEnabled = settings ? settings.enabledModules.includes("editor") || legacyModuleSettings : true;
  const folderSyncEnabled = settings ? settings.enabledModules.includes("folder-sync") || legacyModuleSettings : true;
  const [todayStr, setTodayStr] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const today = new Date();
      setTodayStr(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const currentWeek = getCurrentWeekDates(todayStr);
  const weeklyCount = tasks.filter((task) =>
    task.scheduledDate ? currentWeek.has(task.scheduledDate) : !task.isCompleted,
  ).length;
  const item = (view: string, label: string, Icon: typeof Inbox, count?: number) => (
    <button
      type="button"
      onClick={() => onSelect(view)}
      className={`sidebar-link ${activeView === view ? "sidebar-link-active" : ""}`}
    >
      <Icon size={16} />
      <span className="flex-1 text-left">{label}</span>
      {typeof count === "number" ? <span className="sidebar-count">{count}</span> : null}
    </button>
  );

  return (
    <aside
      aria-hidden={!open}
      inert={!open}
      className={`sidebar-left transition-all duration-200 ${open ? "w-[240px]" : "w-0 border-r-0"}`}
    >
      <div className="min-w-[239px] flex h-full flex-col pb-8">
        <div className="sidebar-identity">
          <div className="sidebar-workspace-mark">N</div>
          <div className="sidebar-workspace-copy"><strong>Notebook</strong><span>Espace local</span></div>
          <span className="sidebar-local-indicator" title="Données stockées localement" />
          <button type="button" className="icon-button" onClick={onToggle} aria-label="Fermer la barre latérale" title="Fermer la barre latérale">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <button
          type="button"
          className="sidebar-search"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        >
          <Search size={14} />
          <span>Rechercher</span>
          <kbd>⌘K · Ctrl+K</kbd>
        </button>
        <button type="button" onClick={onCreate} className="new-note-button">
          <Plus size={16} />
          Nouvelle note
        </button>

        <nav className="mt-3 space-y-1">
          {item("dashboard", "Dashboard", LayoutDashboard)}
          {dailyEnabled ? item("today", "Aujourd'hui", CalendarDays) : null}
          {weeklyEnabled ? item("week", "Semainier", Library, weeklyCount) : null}
          {projectsEnabled ? item("inbox", "Inbox", Inbox, notes.filter((note) => note.status === "inbox").length) : null}
          {projectsEnabled ? item("projects", "Projets", FolderKanban, notes.filter((note) => note.isProject).length) : null}
          {editorEnabled ? item("all", "Toutes les notes", Library, notes.length) : null}
          {item("history", "Historique", History)}
        </nav>

        <div className="mt-6 flex-1">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">Catégories</p>
          <div className="space-y-1">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => onSelect(`category:${category.id}`)}
                className={`sidebar-link ${activeView === `category:${category.id}` ? "sidebar-link-active" : ""}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="flex-1 text-left">{category.name}</span>
                <span className="sidebar-count">{notes.filter((note) => note.categoryId === category.id).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-2">
          {folderSyncEnabled ? (
            <button type="button" onClick={onImportFolder} className="sidebar-link">
              <Upload size={16} /><span className="flex-1 text-left">Importer un dossier</span>
            </button>
          ) : null}
          {item("settings", "Paramètres", Settings)}
        </div>
      </div>
    </aside>
  );
}

function getCurrentWeekDates(today: string): Set<string> {
  if (!today) return new Set();
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return new Set(Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  }));
}
