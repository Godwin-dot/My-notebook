import JSZip from "jszip";
import { stringify } from "yaml";
import { db } from "@/lib/db/dexie";
import { ensureCategory, importNotes, logActivity, restoreWorkspaceMetadata } from "@/lib/db/repositories";
import type { Category, Note, NoteTemplate, TaskItem } from "@/types/models";
import { parseMarkdownNote, type MarkdownImportEntry } from "./markdown-import";

interface WorkspaceMetadata {
  version: 1;
  categories: Category[];
  templates: NoteTemplate[];
  tasks: TaskItem[];
}

export async function exportWorkspaceToZip(): Promise<void> {
  const [notes, categories, templates, tasks] = await Promise.all([
    db.notes.toArray(),
    db.categories.toArray(),
    db.templates.toArray(),
    db.tasks.toArray(),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const zip = new JSZip();

  for (const note of notes) {
    const category = note.categoryId ? categoryById.get(note.categoryId) : undefined;
    const folder = category ? sanitizePathSegment(category.name) : "Sans-categorie";
    const filename = `${sanitizePathSegment(note.title || "Sans titre")}-${note.id.slice(0, 8)}.md`;
    const frontmatter = {
      id: note.id,
      title: note.title,
      summary: note.summary,
      categoryId: note.categoryId,
      parentId: note.parentId,
      status: note.status,
      priority: note.priority,
      tags: note.tags,
      isProject: note.isProject,
      isDaily: note.isDaily,
      dailyDate: note.dailyDate,
      customFields: note.customFields,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    zip.file(`${folder}/${filename}`, `---\n${stringify(frontmatter)}---\n${note.content}`);
  }

  const metadata: WorkspaceMetadata = { version: 1, categories, templates, tasks };
  zip.file("_metadata.json", JSON.stringify(metadata, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pkm-backup-${getLocalDate()}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  await logActivity({
    type: "backup_sync",
    entityTitle: "Workspace",
    details: `Export ZIP de ${notes.length} notes`,
  });
}

export async function importZipArchive(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(file);
  const metadataFile = zip.file("_metadata.json");
  let metadata: WorkspaceMetadata | null = null;
  if (metadataFile) {
    const raw: unknown = JSON.parse(await metadataFile.async("text"));
    metadata = parseWorkspaceMetadata(raw);
    await restoreWorkspaceMetadata(metadata);
  }

  const entries: MarkdownImportEntry[] = [];
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir || path === "_metadata.json" || !/\.(md|txt)$/i.test(path)) continue;
    entries.push({ path, content: await zipEntry.async("text") });
  }
  const count = await importMarkdownEntries(entries);
  await logActivity({
    type: "backup_sync",
    entityTitle: file.name,
    details: `Import ZIP de ${count} notes`,
  });
  return count;
}

export async function importMarkdownEntries(
  entries: MarkdownImportEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<number> {
  const parsedNotes: Note[] = [];
  for (const [index, entry] of entries.entries()) {
    const segments = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
    const categoryName = segments.length > 1 && segments[0].toLocaleLowerCase() !== "sans-categorie" ? segments[0] : "";
    const folderCategory = categoryName ? await ensureCategory(categoryName) : null;
    const parsed = parseMarkdownNote(entry.path, entry.content, folderCategory?.id ?? null);
    const frontmatterCategory = parsed.categoryId ? await db.categories.get(parsed.categoryId) : undefined;
    parsedNotes.push({
      ...parsed,
      categoryId: frontmatterCategory?.id ?? (parsed.categoryId === null ? null : folderCategory?.id ?? null),
    });
    onProgress?.(index + 1, entries.length);
  }
  return importNotes(parsedNotes);
}

function parseWorkspaceMetadata(value: unknown): WorkspaceMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Le fichier _metadata.json est invalide.");
  }
  const metadata = value as Record<string, unknown>;
  return {
    version: 1,
    categories: validItems<Category>(metadata.categories, isCategory),
    templates: validItems<NoteTemplate>(metadata.templates, isTemplate),
    tasks: validItems<TaskItem>(metadata.tasks, isTask),
  };
}

function validItems<T>(value: unknown, isValid: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(isValid) : [];
}

function isCategory(value: unknown): value is Category {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string" &&
    typeof item.color === "string" && typeof item.icon === "string" &&
    typeof item.aiDescription === "string" && typeof item.order === "number";
}

function isTemplate(value: unknown): value is NoteTemplate {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.content === "string";
}

function isTask(value: unknown): value is TaskItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && (typeof item.noteId === "string" || item.noteId === null) &&
    typeof item.text === "string" && typeof item.isCompleted === "boolean" &&
    (typeof item.scheduledDate === "string" || item.scheduledDate === null) &&
    typeof item.order === "number" && typeof item.createdAt === "number";
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "Sans-titre";
}

function getLocalDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
