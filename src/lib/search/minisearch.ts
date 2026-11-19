import MiniSearch, { type SearchResult } from "minisearch";
import type { Note } from "@/types/models";

class SearchEngine {
  private index: MiniSearch<Note>;

  constructor() {
    this.index = new MiniSearch<Note>({
      fields: ["title", "content", "tags"],
      storeFields: ["id", "title", "content"],
      searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 3, tags: 2, content: 1 } },
    });
  }

  async initialize(): Promise<void> {
    const { db } = await import("@/lib/db/dexie");
    const notes = await db.notes.toArray();
    this.index.removeAll();
    this.index.addAll(notes);
  }

  async add(note: Note): Promise<void> {
    this.index.add(note);
  }

  async update(note: Note): Promise<void> {
    if (this.index.has(note.id)) this.index.discard(note.id);
    this.index.add(note);
  }

  async remove(id: string): Promise<void> {
    if (this.index.has(id)) this.index.discard(id);
  }

  search(query: string): SearchResult[] {
    return this.index.search(query);
  }
}

export const searchEngine = new SearchEngine();
