import { v4 as uuid } from "uuid";
import { parse } from "yaml";
import type { Note, NoteStatus, PriorityLevel } from "@/types/models";

export interface MarkdownImportEntry {
  path: string;
  content: string;
}

const noteStatuses: NoteStatus[] = ["inbox", "draft", "active", "waiting", "done", "archived"];
const priorities: PriorityLevel[] = ["low", "medium", "high"];

export function parseMarkdownNote(
  path: string,
  source: string,
  fallbackCategoryId: string | null,
): Note {
  const { frontmatter, content } = extractFrontmatter(path, source);
  const titleFromPath = path.split(/[\\/]/).pop()?.replace(/\.(md|txt)$/i, "") ?? "Note importée";
  const title = stringValue(frontmatter.title) || titleFromPath;
  const inlineTags = extractInlineTags(content);
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.replace(/^#/, ""))
    : [];
  const now = Date.now();
  const customFields = objectValue(frontmatter.customFields) ?? {};
  return {
    id: stringValue(frontmatter.id) || uuid(),
    title,
    content,
    summary: stringValue(frontmatter.summary) || undefined,
    categoryId: Object.prototype.hasOwnProperty.call(frontmatter, "categoryId")
      ? stringValue(frontmatter.categoryId)
      : fallbackCategoryId,
    parentId: stringValue(frontmatter.parentId) || null,
    status: enumValue(frontmatter.status, noteStatuses, "inbox"),
    priority: enumValue(frontmatter.priority, priorities, "medium"),
    tags: [...new Set([...tags, ...inlineTags])],
    isProject: frontmatter.isProject === true,
    isDaily: frontmatter.isDaily === true,
    dailyDate: stringValue(frontmatter.dailyDate) || undefined,
    customFields,
    createdAt: timestampValue(frontmatter.createdAt, now),
    updatedAt: timestampValue(frontmatter.updatedAt, now),
  };
}

function extractFrontmatter(path: string, source: string): { frontmatter: Record<string, unknown>; content: string } {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, content: normalized };
  let parsed: unknown;
  try {
    parsed = parse(match[1]);
  } catch (error) {
    throw new Error(`Frontmatter YAML invalide dans « ${path} »: ${error instanceof Error ? error.message : "erreur inconnue"}`);
  }
  return {
    frontmatter: objectValue(parsed) ?? {},
    content: normalized.slice(match[0].length),
  };
}

function extractInlineTags(content: string): string[] {
  const tags = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}#{1,6}\s/.test(line)) continue;
    for (const match of line.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) tags.add(match[1]);
  }
  return [...tags];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function enumValue<T extends string>(value: unknown, values: T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function timestampValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return fallback;
}
