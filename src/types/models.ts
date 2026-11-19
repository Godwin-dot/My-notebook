export type NoteStatus = "inbox" | "draft" | "active" | "waiting" | "done" | "archived";
export type PriorityLevel = "low" | "medium" | "high";
export type ThemePreset =
  | "obsidian-lime"
  | "artfolio-emerald"
  | "vercel-mono"
  | "midnight-violet"
  | "cyber-cyan"
  | "solar-amber"
  | "runtime-brutal"
  | "custom";

export interface Note {
  id: string;
  title: string;
  content: string;
  summary?: string;
  categoryId: string | null;
  parentId: string | null;
  status: NoteStatus;
  priority: PriorityLevel;
  tags: string[];
  isProject: boolean;
  isDaily: boolean;
  dailyDate?: string;
  customFields: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TaskItem {
  id: string;
  noteId: string | null;
  text: string;
  isCompleted: boolean;
  scheduledDate: string | null;
  order: number;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  aiDescription: string;
  order: number;
}

export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  defaultCategoryId?: string;
}

export interface AppSettings {
  id: "default";
  aiProvider: "gemini" | "openai" | "anthropic" | "custom";
  apiKey: string;
  aiModel: string;
  customEndpoint?: string;
  classificationPrompt: string;
  accentColor: string;
  fontFamily: "sans" | "serif" | "mono";
  editorWidth: "narrow" | "medium" | "wide";
  enabledModules: string[];
  themePreset?: ThemePreset;
  surfaceStyle?: "obsidian" | "pure-black" | "slate-dark";
  borderRadius?: "sharp" | "balanced" | "organic";
  glowIntensity?: "none" | "subtle" | "vivid";
  density?: "compact" | "comfortable" | "spacious";
  headingStyle?: "sans" | "editorial-serif";
}

export interface ActivityLog {
  id: string;
  type: "note_created" | "note_updated" | "note_deleted" | "task_completed" | "project_promoted" | "ai_applied" | "backup_sync";
  entityId?: string;
  entityTitle: string;
  details?: string;
  createdAt: number;
}

export interface NoteSnapshot {
  id: string;
  noteId: string;
  title: string;
  content: string;
  reason: "auto" | "before_ai" | "manual_restore";
  createdAt: number;
}
