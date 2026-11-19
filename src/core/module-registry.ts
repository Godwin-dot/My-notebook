export interface RegisteredModule {
  id: "editor" | "inbox-projects" | "weekly-planner" | "daily-journal" | "folder-sync" | "ai-copilot" | "settings" | "dashboard" | "history";
  name: string;
  enabled: boolean;
}

export type ModuleRegistry = Readonly<Record<RegisteredModule["id"], RegisteredModule>>;

export const moduleRegistry: ModuleRegistry = {
  editor: { id: "editor", name: "Éditeur", enabled: true },
  "inbox-projects": { id: "inbox-projects", name: "Inbox & Projets", enabled: true },
  "weekly-planner": { id: "weekly-planner", name: "Semainier", enabled: true },
  "daily-journal": { id: "daily-journal", name: "Journal quotidien", enabled: true },
  "folder-sync": { id: "folder-sync", name: "Synchronisation de dossiers", enabled: true },
  "ai-copilot": { id: "ai-copilot", name: "Copilote IA", enabled: true },
  settings: { id: "settings", name: "Paramètres", enabled: true },
  dashboard: { id: "dashboard", name: "Tableau de bord", enabled: true },
  history: { id: "history", name: "Historique", enabled: true },
};
