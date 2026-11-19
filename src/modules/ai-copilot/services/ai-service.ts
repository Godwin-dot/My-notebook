import { GoogleGenAI } from "@google/genai";
import type { AppSettings, Category, Note, PriorityLevel, TaskItem } from "@/types/models";

export interface AIClassificationResult {
  suggestedCategoryId: string | null;
  suggestedTags: string[];
  summary: string;
  suggestedLinks: string[];
}

export interface AIVaultContextNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface AIVaultMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIVaultAnswer {
  answer: string;
  citedTitles: string[];
}

export interface AIExtractedTask {
  text: string;
  suggestedDate: string | null;
  priority: PriorityLevel;
}

export interface AIService {
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  classifyNote(note: Note, categories: Category[], existingTitles: string[]): Promise<AIClassificationResult>;
  transformText(text: string, instruction: "structure" | "rewrite" | "continue" | "summarize"): Promise<string>;
  convertIdeaToProject(rawText: string): Promise<{ title: string; content: string; tasks: string[] }>;
  suggestWeeklySchedule(backlogTasks: TaskItem[], weekDates: string[]): Promise<Array<{ taskId: string; suggestedDate: string }>>;
  generateDailyReview(dailyNote: Note, completedTasks: TaskItem[]): Promise<string>;
  askVault(question: string, contextNotes: AIVaultContextNote[], history: AIVaultMessage[]): Promise<AIVaultAnswer>;
  extractTasksFromText(text: string, referenceDate: string): Promise<AIExtractedTask[]>;
}

interface GenerationOptions {
  json?: boolean;
  maxTokens?: number;
}

export function isAIConfigured(settings: AppSettings | undefined): boolean {
  if (!settings?.enabledModules.includes("ai")) return false;
  if (settings.aiProvider === "custom") {
    return Boolean(settings.customEndpoint?.trim());
  }
  return Boolean(settings.apiKey.trim());
}

export function getAIUnavailableReason(settings: AppSettings | undefined, online: boolean): string | undefined {
  if (!online) return "Indisponible hors ligne.";
  if (settings && !settings.enabledModules.includes("ai")) return "Activez le Copilote IA dans Paramètres.";
  if (!isAIConfigured(settings)) return "Configurez une clé API dans Paramètres.";
  return undefined;
}

class BrowserAIService implements AIService {
  private settings: AppSettings | undefined;
  private settingsLoaded = false;

  setSettings(settings: AppSettings | undefined): void {
    this.settings = settings;
    this.settingsLoaded = true;
  }

  private async ensureSettings(): Promise<void> {
    if (this.settingsLoaded) return;
    try {
      const { db } = await import("@/lib/db/dexie");
      this.settings = await db.settings.get("default");
    } catch {
      this.settings = undefined;
    }
    this.settingsLoaded = true;
  }

  isConfigured(): boolean {
    return isAIConfigured(this.settings);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    await this.ensureSettings();
    try {
      const response = await this.generate(
        "Réponds uniquement par le mot OK.",
        "Réponds brièvement à cette demande de vérification.",
        { maxTokens: 16 },
      );
      if (!response.trim()) throw new Error("Le fournisseur n’a renvoyé aucune réponse.");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getAIErrorMessage(error) };
    }
  }

  async classifyNote(note: Note, categories: Category[], existingTitles: string[]): Promise<AIClassificationResult> {
    await this.ensureSettings();
    const settings = await this.getSettings();
    const categoryOptions = categories.map(({ id, name, aiDescription }) => ({ id, name, description: aiDescription }));
    const response = await this.generate(
      [
        "Classe cette note et réponds uniquement avec un objet JSON conforme à ce schéma :",
        '{"suggestedCategoryId": string|null, "suggestedTags": string[], "summary": string, "suggestedLinks": string[]}.',
        "Utilise uniquement un identifiant de catégorie fourni ou null. Les liens doivent être des titres exacts de notes existantes.",
        `Consigne personnalisée : ${settings.classificationPrompt}`,
        `Catégories : ${JSON.stringify(categoryOptions)}`,
        `Titres de notes existantes : ${JSON.stringify(existingTitles)}`,
        `Note : ${JSON.stringify({ title: note.title, content: note.content, tags: note.tags })}`,
      ].join("\n"),
      "Tu es un assistant de classement de notes. N’invente pas de catégories ni de titres de liens.",
      { json: true },
    );
    const value = parseJSON(response);
    const categoryIds = new Set(categories.map((category) => category.id));
    const existingTitleSet = new Set(existingTitles);
    return {
      suggestedCategoryId: typeof value.suggestedCategoryId === "string" && categoryIds.has(value.suggestedCategoryId)
        ? value.suggestedCategoryId
        : null,
      suggestedTags: uniqueStrings(value.suggestedTags, 12),
      summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 1000) : "",
      suggestedLinks: uniqueStrings(value.suggestedLinks, 10).filter((title) => existingTitleSet.has(title)),
    };
  }

  async transformText(
    text: string,
    instruction: "structure" | "rewrite" | "continue" | "summarize",
  ): Promise<string> {
    const instructions: Record<typeof instruction, string> = {
      structure: "Réorganise ce texte en plan Markdown clair, sans perdre les idées importantes.",
      rewrite: "Reformule ce texte en français correct et naturel, sans en changer le sens.",
      continue: "Poursuis ce brouillon dans le même ton et sans répéter son contenu.",
      summarize: "Résume ce texte en Markdown en conservant les points essentiels.",
    };
    const result = await this.generate(
      `${instructions[instruction]}\n\nTexte à traiter :\n${text}`,
      "Tu es un assistant de rédaction. Retourne uniquement le texte Markdown demandé.",
    );
    return requireText(result);
  }

  async convertIdeaToProject(rawText: string): Promise<{ title: string; content: string; tasks: string[] }> {
    await this.ensureSettings();
    const response = await this.generate(
      [
        "Convertis cette idée en fiche projet, sans inventer de faits.",
        'Réponds uniquement avec un objet JSON : {"title": string, "content": string, "tasks": string[]}.',
        `Idée :\n${rawText}`,
      ].join("\n\n"),
      "Tu aides à clarifier des idées en projets concrets. Le contenu doit être du Markdown.",
      { json: true },
    );
    const value = parseJSON(response);
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const content = typeof value.content === "string" ? value.content.trim() : "";
    if (!title || !content) throw new Error("La proposition de projet est incomplète. Réessayez.");
    return { title, content, tasks: uniqueStrings(value.tasks, 30) };
  }

  async suggestWeeklySchedule(
    backlogTasks: TaskItem[],
    weekDates: string[],
  ): Promise<Array<{ taskId: string; suggestedDate: string }>> {
    const tasks = backlogTasks.filter((task) => !task.isCompleted && task.scheduledDate === null);
    const allowedDates = new Set(weekDates);
    const response = await this.generate(
      [
        'Répartis les tâches du backlog sur les dates proposées. Réponds uniquement en JSON : {"suggestions":[{"taskId":string,"suggestedDate":"YYYY-MM-DD"}]}.',
        "Ne crée pas de tâche, n’inclus pas de tâche déjà terminée et choisis uniquement une date fournie.",
        `Dates disponibles : ${JSON.stringify(weekDates)}`,
        `Tâches : ${JSON.stringify(tasks.map(({ id, text }) => ({ id, text })))}`,
      ].join("\n\n"),
      "Tu aides à planifier une semaine réaliste. Respecte les dates et identifiants fournis.",
      { json: true },
    );
    const value = parseJSON(response);
    const taskIds = new Set(tasks.map((task) => task.id));
    const suggestions = Array.isArray(value.suggestions) ? value.suggestions : [];
    const seen = new Set<string>();
    return suggestions.flatMap((item) => {
      if (!isRecord(item) || typeof item.taskId !== "string" || typeof item.suggestedDate !== "string") return [];
      if (!taskIds.has(item.taskId) || !allowedDates.has(item.suggestedDate) || seen.has(item.taskId)) return [];
      seen.add(item.taskId);
      return [{ taskId: item.taskId, suggestedDate: item.suggestedDate }];
    });
  }

  async generateDailyReview(dailyNote: Note, completedTasks: TaskItem[]): Promise<string> {
    await this.ensureSettings();
    const result = await this.generate(
      [
        "Rédige un bilan du jour synthétique en Markdown, à la première personne et sans ajouter de faits.",
        `Journal :\n${dailyNote.content}`,
        `Tâches terminées :\n${completedTasks.map((task) => `- ${task.text}`).join("\n") || "Aucune"}`,
      ].join("\n\n"),
      "Tu aides à relire une journée avec tact, sans jugement.",
    );
    return requireText(result);
  }

  async askVault(
    question: string,
    contextNotes: AIVaultContextNote[],
    history: AIVaultMessage[],
  ): Promise<AIVaultAnswer> {
    await this.ensureSettings();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) throw new Error("Posez une question pour interroger votre coffre.");

    const usableNotes = contextNotes
      .filter((note) => note.title.trim())
      .slice(0, VAULT_MAX_NOTES)
      .map((note) => ({
        title: note.title.trim(),
        tags: note.tags.slice(0, 8),
        content: truncateForContext(note.content),
      }));

    const transcript = history
      .slice(-8)
      .map((message) => `${message.role === "user" ? "Utilisateur" : "Copilote"} : ${truncateForContext(message.content, 700)}`)
      .join("\n");

    const response = await this.generate(
      [
        `Question : ${normalizedQuestion}`,
        transcript ? `Historique récent :\n${transcript}` : "Historique récent : aucun échange.",
        `Notes du coffre (${usableNotes.length}) : ${JSON.stringify(usableNotes)}`,
      ].join("\n\n"),
      [
        "Tu es le copilote documentaire d’un espace de notes personnel.",
        "Règles absolues :",
        "1. Réponds toujours en français, de façon concise et structurée en Markdown.",
        "2. Appuie-toi en priorité sur les notes du coffre fournies dans le contexte.",
        "3. Cite explicitement chaque note utilisée sous la forme exacte [[Titre de la note]].",
        "4. N’invente aucun fait, aucune note et aucun titre absent du contexte.",
        "5. Si l’information n’est pas présente dans les notes, dis-le honnêtement au lieu de deviner.",
      ].join("\n"),
      { maxTokens: 1200 },
    );

    const answer = requireText(response);
    return { answer, citedTitles: extractCitedTitles(answer, usableNotes.map((note) => note.title)) };
  }

  async extractTasksFromText(text: string, referenceDate: string): Promise<AIExtractedTask[]> {
    await this.ensureSettings();
    const source = text.trim();
    if (!source) throw new Error("Ajoutez du texte avant d’extraire des tâches.");
    const reference = isValidISODate(referenceDate) ? referenceDate : new Date().toISOString().slice(0, 10);

    const response = await this.generate(
      [
        "Extrais les actions concrètes de ce texte.",
        'Réponds uniquement avec un objet JSON : {"tasks":[{"text":string,"suggestedDate":"YYYY-MM-DD"|null,"priority":"low"|"medium"|"high"}]}.',
        `Date de référence : ${reference}.`,
        "Règles : une action par entrée, à l’infinitif, sans préfixe ni numérotation, 12 tâches maximum.",
        "Ne propose une date que si le texte ou le contexte le justifie clairement (échéance, jour de la semaine, « demain »…).",
        "Sinon, mets suggestedDate à null pour placer l’action dans le backlog. N’invente aucune action absente du texte.",
        `Texte :\n${truncateForContext(source, 6000)}`,
      ].join("\n"),
      "Tu es un assistant d’extraction d’actions. Tu ne réponds qu’en JSON valide, sans commentaire.",
      { json: true },
    );

    const value = parseJSON(response);
    const items = Array.isArray(value.tasks) ? value.tasks : [];
    const seen = new Set<string>();
    const tasks: AIExtractedTask[] = [];
    for (const item of items) {
      if (!isRecord(item) || typeof item.text !== "string") continue;
      const label = item.text.replace(/^[-*+\d.)\s]+/, "").trim().slice(0, 200);
      if (!label) continue;
      const key = label.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const priority: PriorityLevel = item.priority === "low" || item.priority === "high" ? item.priority : "medium";
      tasks.push({
        text: label,
        suggestedDate: typeof item.suggestedDate === "string" && isValidISODate(item.suggestedDate) ? item.suggestedDate : null,
        priority,
      });
      if (tasks.length >= 12) break;
    }
    return tasks;
  }

  private async getSettings(): Promise<AppSettings> {
    await this.ensureSettings();
    if (!this.settings || !isAIConfigured(this.settings)) {
      throw new Error("Configurez le Copilote IA et son fournisseur dans Paramètres.");
    }
    return this.settings;
  }

  private async generate(prompt: string, systemInstruction: string, options: GenerationOptions = {}): Promise<string> {
    const settings = await this.getSettings();
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Indisponible hors ligne.");

    try {
      if (settings.aiProvider === "gemini") {
        const ai = new GoogleGenAI({ apiKey: settings.apiKey });
        const response = await ai.models.generateContent({
          model: settings.aiModel,
          contents: `${systemInstruction}\n\n${prompt}`,
          config: {
            ...(options.json ? { responseMimeType: "application/json" } : {}),
            ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
          },
        });
        return response.text ?? "";
      }

      const isCustom = settings.aiProvider === "custom";
      const endpoint = isCustom
        ? resolveCustomEndpoint(settings.customEndpoint)
        : settings.aiProvider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.anthropic.com/v1/messages";
      const response = settings.aiProvider === "anthropic"
        ? await fetchAnthropic(endpoint, settings, systemInstruction, prompt, options)
        : await fetchOpenAI(endpoint, settings, systemInstruction, prompt, options, isCustom);
      return response;
    } catch (error) {
      throw new Error(getAIErrorMessage(error));
    }
  }
}

export const aiService = new BrowserAIService();

async function fetchOpenAI(
  endpoint: string,
  settings: AppSettings,
  systemInstruction: string,
  prompt: string,
  options: GenerationOptions,
  custom: boolean,
): Promise<string> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (settings.apiKey.trim()) headers.set("Authorization", `Bearer ${settings.apiKey.trim()}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.aiModel,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options.json && !custom ? { response_format: { type: "json_object" } } : {}),
    }),
  }).catch((error: unknown) => { throw mapNetworkError(error); });
  if (!response.ok) throw await responseError(response);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new Error("Réponse inattendue du fournisseur OpenAI-compatible.");
  }
  const message = payload.choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new Error("Le fournisseur n’a renvoyé aucun texte.");
  }
  return message.content;
}

async function fetchAnthropic(
  endpoint: string,
  settings: AppSettings,
  systemInstruction: string,
  prompt: string,
  options: GenerationOptions,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.aiModel,
      max_tokens: options.maxTokens ?? 2048,
      system: systemInstruction,
      messages: [{ role: "user", content: prompt }],
    }),
  }).catch((error: unknown) => { throw mapNetworkError(error); });
  if (!response.ok) throw await responseError(response);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    throw new Error("Réponse inattendue du fournisseur Anthropic.");
  }
  const text = payload.content.find((part) => isRecord(part) && part.type === "text" && typeof part.text === "string");
  if (!isRecord(text) || typeof text.text !== "string") throw new Error("Le fournisseur n’a renvoyé aucun texte.");
  return text.text;
}

async function responseError(response: Response): Promise<Error> {
  if (response.status === 401 || response.status === 403) {
    return new Error("Clé API invalide ou accès refusé. Vérifiez le fournisseur et la clé dans Paramètres.");
  }
  if (response.status === 429) return new Error("Quota API dépassé. Réessayez plus tard ou vérifiez votre forfait.");
  if (response.status >= 500) return new Error("Le fournisseur IA est temporairement indisponible.");
  const detail = await response.text().catch(() => "");
  return new Error(`Le fournisseur IA a renvoyé une erreur (${response.status})${detail ? ` : ${detail.slice(0, 180)}` : "."}`);
}

function mapNetworkError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(typeof navigator !== "undefined" && !navigator.onLine
      ? "Indisponible hors ligne."
      : "Impossible de joindre le fournisseur IA. Vérifiez votre connexion.");
  }
  return error instanceof Error ? error : new Error("Une erreur réseau inconnue est survenue.");
}

function getAIErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const message = error.message;
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) return "Quota API dépassé. Réessayez plus tard ou vérifiez votre forfait.";
    if (/401|403|PERMISSION_DENIED|API key not valid|unauthorized/i.test(message)) {
      return "Clé API invalide ou accès refusé. Vérifiez le fournisseur et la clé dans Paramètres.";
    }
    if (/offline|failed to fetch|network|fetch failed/i.test(message)) {
      return typeof navigator !== "undefined" && !navigator.onLine
        ? "Indisponible hors ligne."
        : "Impossible de joindre le fournisseur IA. Vérifiez votre connexion.";
    }
    return message;
  }
  return "Une erreur inattendue est survenue avec le fournisseur IA.";
}

function resolveCustomEndpoint(value: string | undefined): string {
  const endpoint = value?.trim().replace(/\/+$/, "");
  if (!endpoint) throw new Error("Saisissez l’URL de l’endpoint personnalisé dans Paramètres.");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("L’URL de l’endpoint personnalisé est invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("L’endpoint doit utiliser HTTP ou HTTPS.");
  }
  return endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint}/chat/completions`;
}

function parseJSON(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value: unknown = JSON.parse(normalized);
    if (isRecord(value)) return value;
  } catch {
    throw new Error("La réponse IA n’est pas un JSON valide. Vous pouvez réessayer.");
  }
  throw new Error("La réponse IA ne respecte pas le format attendu.");
}

function requireText(value: string): string {
  const text = value.trim();
  if (!text) throw new Error("La réponse IA est vide. Vous pouvez réessayer.");
  return text;
}

const VAULT_MAX_NOTES = 5;
const VAULT_MAX_NOTE_CHARS = 1600;

function truncateForContext(value: string, limit = VAULT_MAX_NOTE_CHARS): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function extractCitedTitles(answer: string, knownTitles: string[]): string[] {
  const byLowerCase = new Map<string, string>();
  for (const title of knownTitles) {
    const trimmed = title.trim();
    if (trimmed) byLowerCase.set(trimmed.toLocaleLowerCase(), trimmed);
  }
  const cited: string[] = [];
  const pattern = /\[\[([^\]\n]{1,160})\]\]/g;
  let match = pattern.exec(answer);
  while (match) {
    const title = byLowerCase.get(match[1].trim().toLocaleLowerCase());
    if (title && !cited.includes(title)) cited.push(title);
    match = pattern.exec(answer);
  }
  return cited;
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function uniqueStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    .slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
