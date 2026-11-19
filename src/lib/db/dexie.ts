import Dexie, { type EntityTable } from "dexie";
import type { ActivityLog, AppSettings, Category, Note, NoteSnapshot, NoteTemplate, TaskItem } from "@/types/models";

export class PKMDatabase extends Dexie {
  notes!: EntityTable<Note, "id">;
  tasks!: EntityTable<TaskItem, "id">;
  categories!: EntityTable<Category, "id">;
  templates!: EntityTable<NoteTemplate, "id">;
  settings!: EntityTable<AppSettings, "id">;
  activities!: EntityTable<ActivityLog, "id">;
  snapshots!: EntityTable<NoteSnapshot, "id">;

  constructor() {
    super("PKMDatabase");
    this.version(1).stores({
      notes: "id, categoryId, parentId, status, priority, isProject, isDaily, dailyDate, updatedAt, *tags",
      tasks: "id, noteId, isCompleted, scheduledDate, order",
      categories: "id, order",
      templates: "id",
      settings: "id",
    });
    this.version(2).stores({
      notes: "id, categoryId, parentId, status, priority, isProject, isDaily, dailyDate, updatedAt, *tags",
      tasks: "id, noteId, isCompleted, scheduledDate, order",
      categories: "id, order",
      templates: "id",
      settings: "id",
      activities: "id, type, entityId, createdAt",
      snapshots: "id, noteId, createdAt",
    });
  }
}

export const db = new PKMDatabase();
