import { v4 as uuid } from "uuid";
import type { ActivityLog, AppSettings, Category, Note, NoteSnapshot, NoteStatus, NoteTemplate, PriorityLevel, TaskItem } from "@/types/models";
import { db } from "./dexie";
import { searchEngine } from "@/lib/search/minisearch";

export async function logActivity(entry: Omit<ActivityLog, "id" | "createdAt">): Promise<void> {
  const activity: ActivityLog = { ...entry, id: uuid(), createdAt: Date.now() };
  await db.activities.add(activity);
  const activities = await db.activities.orderBy("createdAt").reverse().toArray();
  if (activities.length > 100) {
    await db.activities.bulkDelete(activities.slice(100).map((item) => item.id));
  }
}

export async function clearActivityHistory(): Promise<void> {
  await db.activities.clear();
}

export async function saveNoteSnapshot(
  noteId: string,
  title: string,
  content: string,
  reason: NoteSnapshot["reason"] = "auto",
): Promise<NoteSnapshot | null> {
  if (!content.trim()) return null;
  const latest = await db.snapshots
    .where("noteId")
    .equals(noteId)
    .reverse()
    .sortBy("createdAt")
    .then((items) => items[0]);
  if (latest?.content === content && latest.title === title) return null;

  if (reason === "auto" && latest && Date.now() - latest.createdAt < 5 * 60 * 1000) return null;

  const snapshot: NoteSnapshot = {
    id: uuid(),
    noteId,
    title,
    content,
    reason,
    createdAt: Date.now(),
  };
  await db.snapshots.add(snapshot);
  const snapshots = await db.snapshots
    .where("noteId")
    .equals(noteId)
    .reverse()
    .sortBy("createdAt");
  if (snapshots.length > 12) {
    await db.snapshots.bulkDelete(snapshots.slice(12).map((item) => item.id));
  }
  return snapshot;
}

export async function restoreNoteSnapshot(snapshotId: string): Promise<Note> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) throw new Error("Version introuvable.");
  const current = await db.notes.get(snapshot.noteId);
  if (!current) throw new Error("Note introuvable.");
  await saveNoteSnapshot(current.id, current.title, current.content, "manual_restore");
  const restored = await updateNote(snapshot.noteId, {
    title: snapshot.title,
    content: snapshot.content,
  });
  await logActivity({
    type: "note_updated",
    entityId: snapshot.noteId,
    entityTitle: snapshot.title,
    details: "Version restaurée depuis l’historique",
  });
  return restored;
}

export interface NoteFilters {
  status?: NoteStatus;
  categoryId?: string;
  isProject?: boolean;
  isDaily?: boolean;
  query?: string;
}

export async function updateAppSettings(changes: Partial<Omit<AppSettings, "id">>): Promise<AppSettings> {
  const current = await db.settings.get("default");
  if (!current) throw new Error("Les paramètres de l’application ne sont pas initialisés.");
  const updated: AppSettings = { ...current, ...changes, id: "default" };
  await db.settings.put(updated);
  return updated;
}

export async function saveCategory(input: Pick<Category, "name" | "color" | "icon" | "aiDescription"> & { id?: string }): Promise<Category> {
  const categories = await db.categories.orderBy("order").toArray();
  const existing = input.id ? categories.find((category) => category.id === input.id) : undefined;
  const category: Category = {
    id: existing?.id ?? uuid(),
    name: input.name.trim(),
    color: input.color,
    icon: input.icon.trim() || "Folder",
    aiDescription: input.aiDescription.trim(),
    order: existing?.order ?? categories.length,
  };
  if (!category.name) throw new Error("Le nom de la catégorie ne peut pas être vide.");
  await db.categories.put(category);
  return category;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const category = await db.categories.get(categoryId);
  const updatedNotes = await db.transaction("rw", db.categories, db.notes, async () => {
    const linkedNotes = await db.notes.where("categoryId").equals(categoryId).toArray();
    const updated = linkedNotes.map((note) => ({ ...note, categoryId: null, updatedAt: Date.now() }));
    if (updated.length) await db.notes.bulkPut(updated);
    await db.categories.delete(categoryId);
    return updated;
  });
  for (const note of updatedNotes) await searchEngine.update(note);
  await logActivity({
    type: "note_updated",
    entityId: categoryId,
    entityTitle: category?.name ?? "Catégorie",
    details: "Catégorie supprimée",
  });
}

export async function moveCategory(categoryId: string, direction: -1 | 1): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    const categories = await db.categories.orderBy("order").toArray();
    const index = categories.findIndex((category) => category.id === categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    [categories[index].order, categories[target].order] = [categories[target].order, categories[index].order];
    await db.categories.bulkPut(categories);
  });
}

export async function saveNoteTemplate(input: Omit<NoteTemplate, "id"> & { id?: string }): Promise<NoteTemplate> {
  const template: NoteTemplate = {
    id: input.id ?? uuid(),
    name: input.name.trim(),
    content: input.content,
    ...(input.defaultCategoryId ? { defaultCategoryId: input.defaultCategoryId } : {}),
  };
  if (!template.name) throw new Error("Le nom du modèle ne peut pas être vide.");
  await db.templates.put(template);
  return template;
}

export async function deleteNoteTemplate(templateId: string): Promise<void> {
  await db.templates.delete(templateId);
}

export async function ensureCategory(name: string): Promise<Category> {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) throw new Error("Le nom de catégorie ne peut pas être vide.");
  const existing = await db.categories.toCollection()
    .filter((category) => category.name.toLocaleLowerCase() === normalized)
    .first();
  if (existing) return existing;
  return saveCategory({ name: name.trim(), color: "#71717A", icon: "Folder", aiDescription: "" });
}

export async function importNotes(notes: Note[]): Promise<number> {
  if (!notes.length) return 0;
  const imported = await db.transaction("rw", db.notes, async () => {
    const existing = await db.notes.toArray();
    const seen = new Set<string>();
    const importedByTitle = new Map<string, Note>();
    const notesToSave = notes.map((incoming) => {
      const titleKey = `${incoming.categoryId ?? ""}\u0000${incoming.title.toLocaleLowerCase()}`;
      const duplicate = existing.find((note) => note.id === incoming.id) ??
        importedByTitle.get(titleKey) ??
        existing.find((note) => !seen.has(note.id) &&
          note.title.toLocaleLowerCase() === incoming.title.toLocaleLowerCase() &&
          note.categoryId === incoming.categoryId);
      const note: Note = duplicate
        ? { ...duplicate, ...incoming, id: duplicate.id, createdAt: duplicate.createdAt, updatedAt: Date.now() }
        : incoming;
      seen.add(note.id);
      importedByTitle.set(titleKey, note);
      return note;
    });
    await db.notes.bulkPut(notesToSave);
    return notesToSave;
  });
  for (const note of imported) await searchEngine.update(note);
  return imported.length;
}

export async function restoreWorkspaceMetadata(metadata: {
  categories: Category[];
  templates: NoteTemplate[];
  tasks: TaskItem[];
}): Promise<void> {
  await db.transaction("rw", db.categories, db.templates, db.tasks, async () => {
    if (metadata.categories.length) await db.categories.bulkPut(metadata.categories);
    if (metadata.templates.length) await db.templates.bulkPut(metadata.templates);
    if (metadata.tasks.length) await db.tasks.bulkPut(metadata.tasks);
  });
}

export async function createNote(input: Partial<Note> = {}): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: uuid(),
    title: input.title ?? "Nouvelle note",
    content: input.content ?? "",
    summary: input.summary,
    categoryId: input.categoryId ?? null,
    parentId: input.parentId ?? null,
    status: input.status ?? "inbox",
    priority: input.priority ?? "medium",
    tags: input.tags ?? [],
    isProject: input.isProject ?? false,
    isDaily: input.isDaily ?? false,
    dailyDate: input.dailyDate,
    customFields: input.customFields ?? {},
    createdAt: now,
    updatedAt: now,
  };
  await db.notes.add(note);
  await searchEngine.add(note);
  await logActivity({
    type: "note_created",
    entityId: note.id,
    entityTitle: note.title,
  });
  return note;
}

export async function updateNote(id: string, changes: Partial<Note>): Promise<Note> {
  const existing = await db.notes.get(id);
  if (!existing) throw new Error(`Note introuvable: ${id}`);
  const updated: Note = { ...existing, ...changes, id, updatedAt: Date.now() };
  await db.notes.put(updated);
  await searchEngine.update(updated);
  return updated;
}

export async function deleteNote(id: string): Promise<void> {
  const existing = await db.notes.get(id);
  await db.notes.delete(id);
  await searchEngine.remove(id);
  await db.tasks.where("noteId").equals(id).delete();
  await db.snapshots.where("noteId").equals(id).delete();
  await logActivity({
    type: "note_deleted",
    entityId: id,
    entityTitle: existing?.title ?? "Note",
  });
}

export async function promoteToProject(noteId: string): Promise<Note> {
  const note = await db.notes.get(noteId);
  if (!note) throw new Error(`Note introuvable: ${noteId}`);
  const promoted = await updateNote(noteId, {
    isProject: true,
    status: note.status === "inbox" ? "active" : note.status,
  });
  await logActivity({
    type: "project_promoted",
    entityId: noteId,
    entityTitle: note.title,
  });
  return promoted;
}

export async function getProjectSubnotes(projectId: string): Promise<Note[]> {
  return db.notes.where("parentId").equals(projectId).sortBy("updatedAt").then((notes) => notes.reverse());
}

export async function getTasksByNoteId(noteId: string): Promise<TaskItem[]> {
  return db.tasks.where("noteId").equals(noteId).sortBy("order");
}

export async function syncNoteTasks(
  noteId: string,
  tasks: Array<{ text: string; isCompleted: boolean }>,
): Promise<TaskItem[]> {
  const note = await db.notes.get(noteId);
  if (!note) throw new Error(`Note introuvable: ${noteId}`);
  const savedTasks = tasks.filter((task) => task.text.trim().length > 0);

  return db.transaction("rw", db.tasks, async () => {
    const existing = await db.tasks.where("noteId").equals(noteId).sortBy("order");
    const unused = new Set(existing.map((task) => task.id));
    const nextTasks: TaskItem[] = savedTasks.map((task, index) => {
      const match = existing.find((candidate) =>
        unused.has(candidate.id) &&
        candidate.text === task.text &&
        candidate.isCompleted === task.isCompleted,
      ) ?? existing.find((candidate) =>
        unused.has(candidate.id) && candidate.text === task.text,
      ) ?? existing.find((candidate) =>
        unused.has(candidate.id) && candidate.order === index,
      ) ?? existing.find((candidate) => unused.has(candidate.id));
      if (match) unused.delete(match.id);
      return {
        id: match?.id ?? uuid(),
        noteId,
        text: task.text,
        isCompleted: task.isCompleted,
        scheduledDate: match?.scheduledDate ?? null,
        order: match?.scheduledDate ? match.order : index,
        createdAt: match?.createdAt ?? Date.now(),
      };
    });

    if (nextTasks.length > 0) await db.tasks.bulkPut(nextTasks);
    if (unused.size) await db.tasks.bulkDelete([...unused]);
    return nextTasks;
  });
}

export async function getOrCreateDailyNote(dateStr: string): Promise<Note> {
  if (!isValidDateString(dateStr)) throw new Error(`Date de journal invalide: ${dateStr}`);

  const note = await db.transaction("rw", db.notes, db.templates, async () => {
    const existing = await db.notes
      .where("dailyDate")
      .equals(dateStr)
      .filter((candidate) => candidate.isDaily)
      .first();
    if (existing) return existing;

    const template = await db.templates
      .toCollection()
      .filter((candidate) => candidate.name === "Journal Quotidien")
      .first();
    const readableDate = capitalize(
      new Date(`${dateStr}T12:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
    const now = Date.now();
    const dailyNote: Note = {
      id: uuid(),
      title: readableDate,
      content: (template?.content ?? "# Journal du {{date}}\n\n## Priorités du jour\n- [ ] \n\n## Notes & Réflexions\n\n## Bilan du soir\n")
        .replaceAll("{{date}}", readableDate),
      categoryId: null,
      parentId: null,
      status: "active",
      priority: "medium",
      tags: [],
      isProject: false,
      isDaily: true,
      dailyDate: dateStr,
      customFields: {},
      createdAt: now,
      updatedAt: now,
    };
    await db.notes.add(dailyNote);
    return dailyNote;
  });

  await searchEngine.update(note);
  return note;
}

export async function createTask(data: {
  text: string;
  noteId?: string | null;
  scheduledDate?: string | null;
}): Promise<TaskItem> {
  const scheduledDate = data.scheduledDate ?? null;
  if (scheduledDate !== null && !isValidDateString(scheduledDate)) {
    throw new Error(`Date de planification invalide: ${scheduledDate}`);
  }
  const task = await db.transaction("rw", db.tasks, async () => {
    const tasks = await db.tasks.toArray();
    const column = tasks.filter((item) => item.scheduledDate === scheduledDate);
    const nextTask: TaskItem = {
      id: uuid(),
      noteId: data.noteId ?? null,
      text: data.text.trim(),
      isCompleted: false,
      scheduledDate,
      order: column.reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1,
      createdAt: Date.now(),
    };
    if (!nextTask.text) throw new Error("Le texte de la tâche ne peut pas être vide.");
    await db.tasks.add(nextTask);
    return nextTask;
  });
  return task;
}

export async function scheduleTask(
  taskId: string,
  scheduledDate: string | null,
  newOrder?: number,
): Promise<TaskItem> {
  if (scheduledDate !== null && !isValidDateString(scheduledDate)) {
    throw new Error(`Date de planification invalide: ${scheduledDate}`);
  }

  return db.transaction("rw", db.tasks, async () => {
    const allTasks = await db.tasks.toArray();
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Tâche introuvable: ${taskId}`);

    const targetColumn = allTasks
      .filter((item) => item.scheduledDate === scheduledDate && item.id !== taskId)
      .sort((left, right) => left.order - right.order);
    const insertAt = newOrder === undefined
      ? targetColumn.length
      : Math.max(0, Math.min(Math.trunc(newOrder), targetColumn.length));
    const updatedTask: TaskItem = { ...task, scheduledDate, order: insertAt };
    targetColumn.splice(insertAt, 0, updatedTask);

    const oldColumn = scheduledDate === task.scheduledDate
      ? []
      : allTasks
        .filter((item) => item.scheduledDate === task.scheduledDate && item.id !== taskId)
        .sort((left, right) => left.order - right.order);
    const reindexedTarget = targetColumn.map((item, index) => ({ ...item, order: index }));
    const reindexedOld = oldColumn.map((item, index) => ({ ...item, order: index }));
    await db.tasks.bulkPut([...reindexedTarget, ...reindexedOld]);
    return reindexedTarget[insertAt];
  });
}

export async function toggleTaskCompletion(taskId: string): Promise<TaskItem> {
  const updated = await db.transaction("rw", db.tasks, db.notes, async () => {
    const task = await db.tasks.get(taskId);
    if (!task) throw new Error(`Tâche introuvable: ${taskId}`);

    const nextTask: TaskItem = { ...task, isCompleted: !task.isCompleted };
    if (task.noteId === null) {
      await db.tasks.put(nextTask);
      return { task: nextTask, note: null, detached: false };
    }

    const note = await db.notes.get(task.noteId);
    if (!note) {
      const detachedTask: TaskItem = { ...nextTask, noteId: null };
      await db.tasks.put(detachedTask);
      return { task: detachedTask, note: null, detached: true };
    }
    const content = updateMarkdownTaskState(note.content, task, nextTask.isCompleted);
    const updatedNote: Note = { ...note, content, updatedAt: Date.now() };
    await db.tasks.put(nextTask);
    await db.notes.put(updatedNote);
    return { task: nextTask, note: updatedNote, detached: false };
  });

  if (updated.note) await searchEngine.update(updated.note);
  await logActivity({
    type: "task_completed",
    entityId: taskId,
    entityTitle: updated.task.text,
    details: updated.detached
      ? "Tâche détachée de sa note introuvable"
      : updated.task.isCompleted ? "Tâche terminée" : "Tâche réouverte",
  });
  return updated.task;
}

export async function deleteTask(taskId: string): Promise<void> {
  const result = await db.transaction("rw", db.tasks, db.notes, async () => {
    const task = await db.tasks.get(taskId);
    if (!task) return null;
    let updatedNote: Note | null = null;
    if (task.noteId) {
      const note = await db.notes.get(task.noteId);
      if (note) {
        const content = removeMarkdownTask(note.content, task);
        if (content !== note.content) {
          updatedNote = { ...note, content, updatedAt: Date.now() };
          await db.notes.put(updatedNote);
        }
      }
    }
    await db.tasks.delete(taskId);
    return { task, note: updatedNote };
  });
  if (!result) return;
  if (result.note) await searchEngine.update(result.note);
  await logActivity({
    type: "task_completed",
    entityId: taskId,
    entityTitle: result.task.text,
    details: "Tâche supprimée",
  });
}

export async function filterNotes(filters: NoteFilters = {}): Promise<Note[]> {
  let notes = await db.notes.reverse().sortBy("updatedAt");
  if (filters.status) notes = notes.filter((note) => note.status === filters.status);
  if (filters.categoryId) notes = notes.filter((note) => note.categoryId === filters.categoryId);
  if (typeof filters.isProject === "boolean") notes = notes.filter((note) => note.isProject === filters.isProject);
  if (typeof filters.isDaily === "boolean") notes = notes.filter((note) => note.isDaily === filters.isDaily);
  if (filters.query?.trim()) {
    const ids = new Set(searchEngine.search(filters.query).map((result) => result.id));
    notes = notes.filter((note) => ids.has(note.id));
  }
  return notes;
}

export type { PriorityLevel };

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}

function updateMarkdownTaskState(content: string, task: TaskItem, completed: boolean): string {
  const lines = content.split(/\r?\n/);
  const index = findMarkdownTaskIndex(lines, task);
  if (index < 0) throw new Error(`La tâche « ${task.text} » n’a pas été trouvée dans la note.`);
  lines[index] = lines[index].replace(
    /^(\s*(?:[-*+]|\d+\.)\s+\[)[ xX](\])/,
    `$1${completed ? "x" : " "}$2`,
  );
  return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
}

function removeMarkdownTask(content: string, task: TaskItem): string {
  const lines = content.split(/\r?\n/);
  const index = findMarkdownTaskIndex(lines, task);
  if (index < 0) return content;
  lines.splice(index, 1);
  return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
}

function findMarkdownTaskIndex(lines: string[], task: TaskItem): number {
  const candidates = lines
    .map((line, index) => {
      const match = line.match(/^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\]\s*)(.*)$/);
      return match ? { line, index, checked: match[2].toLocaleLowerCase() === "x", text: normalizeTaskText(match[4]) } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const normalizedText = normalizeTaskText(task.text);
  const match = candidates.find((candidate) =>
    candidate.text === normalizedText && candidate.checked === task.isCompleted,
  ) ?? candidates.find((candidate) => candidate.text === normalizedText);
  return match?.index ?? -1;
}

function normalizeTaskText(value: string): string {
  return value
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim()
    .toLocaleLowerCase();
}
