import { v4 as uuid } from "uuid";
import type { AppSettings, Category, Note, NoteTemplate } from "@/types/models";
import { db } from "./dexie";

const defaultSettings: AppSettings = {
  id: "default",
  aiProvider: "gemini",
  apiKey: "",
  aiModel: "gemini-3.5-flash-lite",
  classificationPrompt: "Classe cette note dans la catégorie la plus pertinente.",
  accentColor: "#A3E635",
  fontFamily: "sans",
  editorWidth: "medium",
  enabledModules: ["editor", "daily", "weekly", "projects", "folder-sync", "ai"],
  themePreset: "obsidian-lime",
  surfaceStyle: "obsidian",
  borderRadius: "organic",
  glowIntensity: "subtle",
  density: "comfortable",
  headingStyle: "editorial-serif",
};

export async function initializeDatabase(): Promise<void> {
  await db.transaction("rw", db.settings, db.categories, db.notes, db.templates, async () => {
    const existingSettings = await db.settings.get("default");
    if (!existingSettings) {
      await db.settings.add(defaultSettings);
    } else {
      const normalized: AppSettings = {
        ...existingSettings,
        apiKey: existingSettings.apiKey.trim(),
        customEndpoint: existingSettings.customEndpoint?.trim(),
        aiModel: existingSettings.aiModel?.trim() || defaultSettings.aiModel,
        enabledModules: existingSettings.enabledModules.includes("ai")
          ? existingSettings.enabledModules
          : [...existingSettings.enabledModules, "ai"],
      };
      if (
        normalized.apiKey !== existingSettings.apiKey ||
        normalized.customEndpoint !== existingSettings.customEndpoint ||
        normalized.aiModel !== existingSettings.aiModel ||
        normalized.enabledModules.length !== existingSettings.enabledModules.length
      ) {
        await db.settings.put(normalized);
      }
    }

    const dailyTemplate = await db.templates
      .toCollection()
      .filter((template) => template.name === "Journal Quotidien")
      .first();
    if (!dailyTemplate) {
      const template: NoteTemplate = {
        id: "daily-journal-default",
        name: "Journal Quotidien",
        content: "# Journal du {{date}}\n\n## Priorités du jour\n- [ ] \n\n## Notes & Réflexions\n\n## Bilan du soir\n",
      };
      await db.templates.add(template);
    }

    if ((await db.categories.count()) === 0) {
      const categories: Category[] = [
        { id: uuid(), name: "Développement", color: "#3B82F6", icon: "Code2", aiDescription: "Notes techniques et développement.", order: 0 },
        { id: uuid(), name: "Écriture & Idées", color: "#A855F7", icon: "Lightbulb", aiDescription: "Écriture, créativité et idées.", order: 1 },
        { id: uuid(), name: "Personnel", color: "#10B981", icon: "UserRound", aiDescription: "Notes personnelles et journaling.", order: 2 },
      ];
      await db.categories.bulkAdd(categories);
    }

    if ((await db.notes.count()) === 0) {
      const now = Date.now();
      const welcome: Note = {
        id: uuid(),
        title: "Bienvenue dans votre espace",
        content: "# Bienvenue\n\nCommencez à écrire ici. Vos données restent locales dans ce navigateur.",
        categoryId: null,
        parentId: null,
        status: "inbox",
        priority: "medium",
        tags: ["bienvenue"],
        isProject: false,
        isDaily: false,
        customFields: {},
        createdAt: now,
        updatedAt: now,
      };
      await db.notes.add(welcome);
    }
  });
}
