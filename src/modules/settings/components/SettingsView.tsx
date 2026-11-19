"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Palette,
  Puzzle,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Download,
} from "lucide-react";
import { db } from "@/lib/db/dexie";
import { LeftSidebarOpenButton } from "@/components/layout/LeftSidebarOpenButton";
import { aiService } from "@/modules/ai-copilot/services/ai-service";
import {
  deleteCategory,
  deleteNoteTemplate,
  moveCategory,
  saveCategory,
  saveNoteTemplate,
  updateAppSettings,
} from "@/lib/db/repositories";
import { exportWorkspaceToZip, importZipArchive } from "@/modules/folder-sync/services/zip-service";
import { applyThemeTokens } from "@/lib/theme/apply-theme-tokens";
import type { AppSettings, Category, NoteTemplate, ThemePreset } from "@/types/models";
import { useConfirm } from "@/components/ui/ConfirmProvider";

type SettingsTab = "ai" | "appearance" | "library" | "data";

const tabs: Array<{ id: SettingsTab; label: string; Icon: typeof KeyRound }> = [
  { id: "ai", label: "IA · BYOK", Icon: KeyRound },
  { id: "appearance", label: "Apparence", Icon: Palette },
  { id: "library", label: "Catégories & modèles", Icon: Settings2 },
  { id: "data", label: "Modules & données", Icon: Puzzle },
];

const themePresets: Array<{
  id: Exclude<ThemePreset, "custom">;
  name: string;
  color: string;
  surfaceStyle: NonNullable<AppSettings["surfaceStyle"]>;
  glowIntensity: NonNullable<AppSettings["glowIntensity"]>;
}> = [
  { id: "obsidian-lime", name: "Obsidian Lime", color: "#A3E635", surfaceStyle: "obsidian", glowIntensity: "subtle" },
  { id: "artfolio-emerald", name: "Artfolio Emerald", color: "#34D399", surfaceStyle: "obsidian", glowIntensity: "vivid" },
  { id: "vercel-mono", name: "Vercel Monochrome", color: "#FAFAFA", surfaceStyle: "pure-black", glowIntensity: "none" },
  { id: "midnight-violet", name: "Midnight Violet", color: "#A855F7", surfaceStyle: "slate-dark", glowIntensity: "subtle" },
  { id: "cyber-cyan", name: "Cyber Cyan", color: "#22D3EE", surfaceStyle: "pure-black", glowIntensity: "vivid" },
  { id: "solar-amber", name: "Solar Amber", color: "#FBBF24", surfaceStyle: "obsidian", glowIntensity: "subtle" },
];

const modules = [
  { id: "editor", label: "Éditeur hybride", description: "Notes, propriétés, wikilinks" },
  { id: "projects", label: "Inbox & projets", description: "Capture rapide et vues projet" },
  { id: "daily", label: "Journal quotidien", description: "Notes datées et navigation par jour" },
  { id: "weekly", label: "Semainier", description: "Backlog et planification hebdomadaire" },
  { id: "folder-sync", label: "Import de dossiers", description: "Fichiers Markdown, texte et ZIP" },
  { id: "ai", label: "Copilote IA", description: "Actions IA explicites, à la demande" },
];

const defaultClassificationPrompt = `Tu es un assistant expert en organisation de notes personnelles (PKM).

Analyse la note fournie et propose :
1. La catégorie existante la plus pertinente (sans en inventer).
2. 3 à 5 tags précis, en minuscules, sans #, sans doublons.
3. Un résumé exécutif en exactement 2 phrases, à la troisième personne.
4. Les liens [[Titre]] pertinents parmi les notes existantes.

Sois concis, factuel et ne paraphrase pas le contenu.`;
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_TEMPLATES: NoteTemplate[] = [];

const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash — Recommandé" },
    { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite — Ultra-rapide" },
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro — Raisonnement avancé" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "o4-mini", label: "o4-mini" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet-latest" },
    { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest" },
  ],
  custom: [],
};

export function SettingsView({
  settings,
  onImportFolder,
  leftOpen = true,
  onToggleLeft,
}: {
  settings?: AppSettings;
  onImportFolder: () => void;
  leftOpen?: boolean;
  onToggleLeft?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  async function save(changes: Partial<Omit<AppSettings, "id">>) {
    setError("");
    setNotice("");
    if (settings && (
      "accentColor" in changes ||
      "surfaceStyle" in changes ||
      "borderRadius" in changes ||
      "glowIntensity" in changes ||
      "density" in changes ||
      "fontFamily" in changes ||
      "headingStyle" in changes
    )) {
      applyThemeTokens({ ...settings, ...changes });
    }
    try {
      await updateAppSettings(changes);
      setNotice("Paramètres enregistrés localement.");
    } catch {
      if (settings) applyThemeTokens(settings);
      setError("Impossible d’enregistrer les paramètres.");
    }
  }

  async function testConnection(candidate: AppSettings) {
    const normalized: AppSettings = {
      ...candidate,
      apiKey: candidate.apiKey.trim(),
      customEndpoint: candidate.customEndpoint?.trim(),
      aiModel: candidate.aiModel.trim(),
    };
    setTestingKey(true);
    setNotice("");
    setError("");
    aiService.setSettings(normalized);
    try {
      const result = await aiService.testConnection();
      if (result.ok) setNotice(`Connexion au fournisseur IA réussie (modèle ${normalized.aiModel}).`);
      else setError(result.error ?? "La connexion au fournisseur IA a échoué.");
    } finally {
      aiService.setSettings(settings);
      setTestingKey(false);
    }
  }

  async function handleZipImport(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const count = await importZipArchive(file);
      setNotice(`${count} note${count > 1 ? "s" : ""} importée${count > 1 ? "s" : ""} depuis l’archive.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’archive n’a pas pu être importée.");
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }

  if (!settings) {
    return <div className="settings-view settings-loading" role="status">Chargement des paramètres…</div>;
  }

  return (
    <div className="settings-view">
      <header className="settings-heading">
        <div className="flex items-start gap-3">
          {onToggleLeft ? <LeftSidebarOpenButton open={leftOpen} onClick={onToggleLeft} /> : null}
          <div>
            <p className="collection-kicker">ESPACE LOCAL · PRÉFÉRENCES</p>
            <h1>Paramètres</h1>
            <p>Votre espace, ses règles et ses données — conservés dans ce navigateur.</p>
          </div>
        </div>
        <span className="settings-local-badge"><span /> Stockage local</span>
      </header>

      <nav className="settings-tabs" aria-label="Panneaux des paramètres">
        {tabs.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            className={activeTab === id ? "settings-tab settings-tab-active" : "settings-tab"}
            onClick={() => { setActiveTab(id); setError(""); setNotice(""); }}
          >
            <Icon size={15} />{label}
          </button>
        ))}
      </nav>

      {activeTab === "ai" ? <AiSettings settings={settings} save={save} showKey={showKey} setShowKey={setShowKey} testConnection={(key) => void testConnection(key)} testingKey={testingKey} /> : null}
      {activeTab === "appearance" ? <AppearanceSettings settings={settings} save={save} /> : null}
      {activeTab === "library" ? <LibrarySettings /> : null}
      {activeTab === "data" ? (
        <DataSettings
          settings={settings}
          save={save}
          onExport={() => void exportWorkspaceToZip().catch(() => setError("L’archive n’a pas pu être créée."))}
          onImportZip={() => zipInputRef.current?.click()}
          onImportFolder={onImportFolder}
        />
      ) : null}

      {notice ? <p className="settings-feedback settings-feedback-ok" role="status"><Check size={14} />{notice}</p> : null}
      {error ? <p className="settings-feedback settings-feedback-error" role="alert">{error}</p> : null}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(event) => void handleZipImport(event.target.files?.[0])}
        aria-label="Choisir une archive ZIP"
      />
    </div>
  );
}

function AiSettings({
  settings,
  save,
  showKey,
  setShowKey,
  testConnection,
  testingKey,
}: {
  settings: AppSettings;
  save: (changes: Partial<Omit<AppSettings, "id">>) => Promise<void>;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  testConnection: (candidate: AppSettings) => void;
  testingKey: boolean;
}) {
  const [model, setModel] = useState(settings.aiModel);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [customEndpoint, setCustomEndpoint] = useState(settings.customEndpoint ?? "");
  const [classificationPrompt, setClassificationPrompt] = useState(settings.classificationPrompt);

  return (
    <section className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon"><Sparkles size={17} /></span>
        <div><h2>Configuration IA</h2><p>BYOK — aucun appel ne part sans une action explicite.</p></div>
      </div>
      <div className="settings-form-grid">
        <label className="settings-field">
          <span>Fournisseur</span>
          <select value={settings.aiProvider} onChange={(event) => void save({ aiProvider: event.target.value as AppSettings["aiProvider"] })}>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">Endpoint personnalisé · Ollama / compatible OpenAI</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Modèle</span>
          <select
            value={(MODEL_OPTIONS[settings.aiProvider] ?? []).some((option) => option.value === model) ? model : "__custom__"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "__custom__") {
                setModel(settings.aiModel);
              } else {
                setModel(value);
                void save({ aiModel: value });
              }
            }}
          >
            {(MODEL_OPTIONS[settings.aiProvider] ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            <option value="__custom__">Autre (saisie libre)</option>
          </select>
          {!(MODEL_OPTIONS[settings.aiProvider] ?? []).some((option) => option.value === model) ? (
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              onBlur={() => void save({ aiModel: model })}
              placeholder="Nom du modèle"
            />
          ) : null}
        </label>
        {settings.aiProvider === "custom" ? (
          <label className="settings-field settings-field-wide">
            <span>URL de l’endpoint</span>
            <input
              type="url"
              value={customEndpoint}
              onChange={(event) => setCustomEndpoint(event.target.value)}
              onBlur={() => void save({ customEndpoint })}
              placeholder="http://localhost:11434/v1"
            />
          </label>
        ) : null}
        <label className="settings-field settings-field-wide">
          <span>Clé API</span>
          <div className="settings-secret-field">
            <input
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onBlur={() => void save({ apiKey })}
              placeholder="Saisir une clé API"
            />
            <button type="button" aria-label={showKey ? "Masquer la clé API" : "Afficher la clé API"} onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <small>Stockée uniquement localement dans votre navigateur (IndexedDB).</small>
        </label>
        <label className="settings-field settings-field-wide">
          <span>Prompt système de classification</span>
          <textarea
            rows={5}
            value={classificationPrompt}
            onChange={(event) => setClassificationPrompt(event.target.value)}
            onBlur={() => void save({ classificationPrompt })}
          />
          <button type="button" className="settings-inline-action" onClick={() => {
            setClassificationPrompt(defaultClassificationPrompt);
            void save({ classificationPrompt: defaultClassificationPrompt });
          }}>
            <RotateCcw size={12} /> Réinitialiser par défaut
          </button>
        </label>
        <div className="settings-field settings-field-wide">
          <button
            type="button"
            className="settings-primary-button"
            disabled={testingKey}
            onClick={() => testConnection({ ...settings, apiKey, aiModel: model, customEndpoint })}
          >
            <Sparkles size={14} />{testingKey ? "Vérification…" : "Tester la connexion API"}
          </button>
          <small>Envoie une requête de test courte au fournisseur sélectionné uniquement après ce clic.</small>
        </div>
      </div>
    </section>
  );
}

function AppearanceSettings({
  settings,
  save,
}: {
  settings: AppSettings;
  save: (changes: Partial<Omit<AppSettings, "id">>) => Promise<void>;
}) {
  const isLegacyBlue = settings.accentColor.toUpperCase() === "#3B82F6";

  function applyPreset(preset: (typeof themePresets)[number]) {
    const changes = {
      themePreset: preset.id,
      accentColor: preset.color,
      surfaceStyle: preset.surfaceStyle,
      glowIntensity: preset.glowIntensity,
    };
    applyThemeTokens({ ...settings, ...changes });
    void save(changes);
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon"><Palette size={17} /></span>
        <div><h2>Studio d’apparence</h2><p>Composez l’atmosphère, le rythme et la voix de votre espace local.</p></div>
      </div>
      <div className="settings-theme-grid" aria-label="Thèmes signatures">
        {themePresets.map((preset) => {
          const selected = settings.themePreset === preset.id && settings.accentColor.toUpperCase() === preset.color;
          return (
            <button
              type="button"
              key={preset.id}
              className={`settings-theme-card ${selected ? "settings-theme-card-active" : ""}`}
              onClick={() => applyPreset(preset)}
              aria-pressed={selected}
            >
              <span className="settings-theme-preview" style={{ "--preview-accent": preset.color } as React.CSSProperties}>
                <i /><i /><i />
              </span>
              <span className="settings-theme-name">{preset.name}</span>
              <span className="settings-theme-color">{preset.color}</span>
            </button>
          );
        })}
      </div>
      <div className="settings-setting-block">
        <div className="settings-block-heading">
          <div><h3>Accent sur mesure</h3><p>Le contraste du texte actif s’ajuste automatiquement à la luminosité.</p></div>
          <code>{settings.accentColor}</code>
        </div>
        <div className="settings-color-row">
          {themePresets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`settings-color-swatch ${settings.accentColor.toUpperCase() === preset.color ? "settings-color-selected" : ""}`}
              style={{ "--swatch-color": preset.color } as React.CSSProperties}
              onClick={() => {
                applyThemeTokens({ ...settings, accentColor: preset.color, themePreset: preset.id });
                void save({ accentColor: preset.color, themePreset: preset.id });
              }}
              aria-label={preset.name}
              aria-pressed={settings.accentColor.toUpperCase() === preset.color}
            />
          ))}
          <label className="settings-color-custom" title="Choisir une couleur personnalisée">
            <input
              type="color"
              value={settings.accentColor}
              onChange={(event) => {
                const accentColor = event.target.value.toUpperCase();
                applyThemeTokens({ ...settings, accentColor, themePreset: "custom" });
                void save({ accentColor, themePreset: "custom" });
              }}
              aria-label="Couleur personnalisée"
            />
            <span>Personnalisée</span>
          </label>
        </div>
        <div className="settings-contrast-preview"><span className="pill-active">Texte lisible sur accent</span><span>Contraste calculé en direct</span></div>
      </div>
      {isLegacyBlue ? (
        <div className="settings-legacy-theme">
          <p>Votre ancien accent bleu est conservé. Découvrez le nouveau thème par défaut.</p>
          <button type="button" className="settings-primary-button" onClick={() => applyPreset(themePresets[0])}>
            Appliquer Obsidian Lime
          </button>
        </div>
      ) : null}
      <div className="settings-setting-block">
        <div className="settings-block-heading"><div><h3>Atmosphère & surfaces</h3><p>Une base sombre et un halo mesuré, sans flou coûteux.</p></div></div>
        <div className="settings-choice-row settings-theme-controls">
          {([
            ["obsidian", "Obsidienne profonde"],
            ["pure-black", "Noir pur OLED"],
            ["slate-dark", "Ardoise nuit"],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} onClick={() => void save({ surfaceStyle: value, themePreset: "custom" })} className={`settings-choice-card ${settings.surfaceStyle === value ? "settings-choice-active" : ""}`}>
              <span className="settings-surface-preview" data-surface={value} /><strong>{label}</strong>
            </button>
          ))}
        </div>
        <ChoiceSetting
          title="Intensité des halos"
          value={settings.glowIntensity ?? "subtle"}
          options={[["none", "Désactivé"], ["subtle", "Subtil"], ["vivid", "Intense"]]}
          onChange={(glowIntensity) => void save({ glowIntensity, themePreset: "custom" })}
        />
      </div>
      <div className="settings-setting-block">
        <div className="settings-block-heading"><div><h3>Géométrie & densité</h3><p>Réglez la respiration des cartes et la compacité des listes.</p></div></div>
        <ChoiceSetting
          title="Arrondis"
          value={settings.borderRadius ?? "organic"}
          options={[["sharp", "Anguleux"], ["balanced", "Équilibré"], ["organic", "Organique"]]}
          onChange={(borderRadius) => void save({ borderRadius })}
        />
        <ChoiceSetting
          title="Densité d’affichage"
          value={settings.density ?? "comfortable"}
          options={[["compact", "Compact"], ["comfortable", "Confortable"], ["spacious", "Aéré"]]}
          onChange={(density) => void save({ density })}
        />
      </div>
      <div className="settings-setting-block">
        <div className="settings-block-heading"><div><h3>Typographie & lecture</h3><p>Associez des titres éditoriaux à une police de lecture confortable.</p></div></div>
        <ChoiceSetting
          title="Style des titres"
          value={settings.headingStyle ?? "editorial-serif"}
          options={[["editorial-serif", "Éditorial Serif + Sans"], ["sans", "Moderne 100 % Sans"]]}
          onChange={(headingStyle) => void save({ headingStyle })}
        />
        <div className="settings-choice-row">
          {([
            ["sans", "Sans", "Aa", "font-sans"],
            ["serif", "Sérif", "Aa", "font-serif"],
            ["mono", "Mono", "Aa", "font-mono"],
          ] as const).map(([value, label, sample, fontClass]) => (
            <button type="button" key={value} onClick={() => void save({ fontFamily: value })} className={`settings-choice-card ${settings.fontFamily === value ? "settings-choice-active" : ""}`}>
              <span className={fontClass}>{sample}</span><strong>{label}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-setting-block">
        <div className="settings-block-heading"><div><h3>Largeur de lecture</h3><p>Largeur maximale de l’éditeur.</p></div></div>
        <div className="settings-choice-row settings-width-choices">
          {([
            ["narrow", "Étroit", "max-w-2xl"],
            ["medium", "Moyen", "max-w-3xl"],
            ["wide", "Large", "max-w-5xl"],
          ] as const).map(([value, label, width]) => (
            <button type="button" key={value} onClick={() => void save({ editorWidth: value })} className={`settings-choice-card ${settings.editorWidth === value ? "settings-choice-active" : ""}`}>
              <span className={`settings-width-preview ${width}`} /><strong>{label}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChoiceSetting<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-choice-setting">
      <p>{title}</p>
      <div className="settings-choice-row" role="group" aria-label={title}>
        {options.map(([option, label]) => (
          <button
            type="button"
            key={option}
            aria-pressed={value === option}
            className={`settings-choice-card settings-choice-pill ${value === option ? "settings-choice-active" : ""}`}
            onClick={() => onChange(option)}
          >
            <strong>{label}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function LibrarySettings() {
  const confirm = useConfirm();
  const categories = useLiveQuery(() => db.categories.orderBy("order").toArray()) ?? EMPTY_CATEGORIES;
  const templates = useLiveQuery(() => db.templates.toArray()) ?? EMPTY_TEMPLATES;
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplate);
  const [error, setError] = useState("");

  async function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await saveCategory(categoryDraft);
      setCategoryDraft(emptyCategory());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La catégorie n’a pas pu être enregistrée.");
    }
  }

  async function submitTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await saveNoteTemplate(templateDraft);
      setTemplateDraft(emptyTemplate());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le modèle n’a pas pu être enregistré.");
    }
  }

  async function removeCategory(id: string) {
    const confirmed = await confirm({
      title: "Supprimer cette catégorie ?",
      description: "Les notes liées resteront disponibles et seront remises sans catégorie.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteCategory(id);
      if (categoryDraft.id === id) setCategoryDraft(emptyCategory());
    } catch {
      setError("La catégorie n’a pas pu être supprimée.");
    }
  }

  async function removeTemplate(id: string) {
    const confirmed = await confirm({
      title: "Supprimer ce modèle de note ?",
      description: "Ce modèle ne sera plus proposé lors de la création de nouvelles notes.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteNoteTemplate(id);
      if (templateDraft.id === id) setTemplateDraft(emptyTemplate());
    } catch {
      setError("Le modèle n’a pas pu être supprimé.");
    }
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon"><Settings2 size={17} /></span>
        <div><h2>Catégories & modèles</h2><p>La taxonomie et les points de départ de vos notes.</p></div>
      </div>
      <div className="settings-library-grid">
        <section className="settings-library-section">
          <div className="settings-section-title"><div><h3>Catégories</h3><p>{categories.length} domaine{categories.length !== 1 ? "s" : ""}</p></div></div>
          <div className="settings-record-list">
            {categories.map((category, index) => (
              <article className="settings-record" key={category.id}>
                <button type="button" className="settings-record-main" onClick={() => setCategoryDraft({ ...category })}>
                  <i style={{ backgroundColor: category.color }} />
                  <span><strong>{category.name}</strong><small>{category.aiDescription || "Aucune description sémantique"}</small></span>
                </button>
                <div className="settings-record-actions">
                  <button type="button" aria-label={`Monter ${category.name}`} disabled={index === 0} onClick={() => void moveCategory(category.id, -1)}><ArrowUp size={13} /></button>
                  <button type="button" aria-label={`Descendre ${category.name}`} disabled={index === categories.length - 1} onClick={() => void moveCategory(category.id, 1)}><ArrowDown size={13} /></button>
                  <button type="button" aria-label={`Supprimer ${category.name}`} onClick={() => void removeCategory(category.id)}><Trash2 size={13} /></button>
                </div>
              </article>
            ))}
          </div>
          <form className="settings-edit-form" onSubmit={(event) => void submitCategory(event)}>
            <h4>{categoryDraft.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</h4>
            <label className="settings-field"><span>Nom</span><input required value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
            <div className="settings-inline-fields">
              <label className="settings-field"><span>Couleur</span><input type="color" value={categoryDraft.color} onChange={(event) => setCategoryDraft({ ...categoryDraft, color: event.target.value })} /></label>
              <label className="settings-field"><span>Icône Lucide</span><input value={categoryDraft.icon} onChange={(event) => setCategoryDraft({ ...categoryDraft, icon: event.target.value })} placeholder="Folder" /></label>
            </div>
            <label className="settings-field"><span>Description sémantique pour l’IA</span><textarea rows={3} value={categoryDraft.aiDescription} onChange={(event) => setCategoryDraft({ ...categoryDraft, aiDescription: event.target.value })} /></label>
            <div className="settings-form-actions"><button type="submit" className="settings-primary-button">{categoryDraft.id ? "Enregistrer" : "Créer"}</button>{categoryDraft.id ? <button type="button" className="settings-secondary-button" onClick={() => setCategoryDraft(emptyCategory())}>Annuler</button> : null}</div>
          </form>
        </section>

        <section className="settings-library-section">
          <div className="settings-section-title"><div><h3>Modèles de notes</h3><p>{templates.length} modèle{templates.length !== 1 ? "s" : ""}</p></div></div>
          <div className="settings-record-list">
            {templates.map((template) => (
              <article className="settings-record" key={template.id}>
                <button type="button" className="settings-record-main" onClick={() => setTemplateDraft({ id: template.id, name: template.name, content: template.content, defaultCategoryId: template.defaultCategoryId ?? "" })}>
                  <span className="settings-template-mark">MD</span>
                  <span><strong>{template.name}</strong><small>{template.content.split(/\r?\n/).find((line) => line.trim()) || "Modèle vide"}</small></span>
                </button>
                <div className="settings-record-actions"><button type="button" aria-label={`Supprimer ${template.name}`} onClick={() => void removeTemplate(template.id)}><Trash2 size={13} /></button></div>
              </article>
            ))}
          </div>
          <form className="settings-edit-form" onSubmit={(event) => void submitTemplate(event)}>
            <h4>{templateDraft.id ? "Modifier le modèle" : "Nouveau modèle"}</h4>
            <label className="settings-field"><span>Nom</span><input required value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></label>
            <label className="settings-field"><span>Catégorie par défaut</span><select value={templateDraft.defaultCategoryId} onChange={(event) => setTemplateDraft({ ...templateDraft, defaultCategoryId: event.target.value })}><option value="">Aucune</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="settings-field"><span>Contenu Markdown</span><textarea rows={8} value={templateDraft.content} onChange={(event) => setTemplateDraft({ ...templateDraft, content: event.target.value })} /></label>
            <div className="settings-form-actions"><button type="submit" className="settings-primary-button">{templateDraft.id ? "Enregistrer" : "Créer"}</button>{templateDraft.id ? <button type="button" className="settings-secondary-button" onClick={() => setTemplateDraft(emptyTemplate())}>Annuler</button> : null}</div>
          </form>
        </section>
      </div>
      {error ? <p className="settings-feedback settings-feedback-error" role="alert">{error}</p> : null}
    </section>
  );
}

function DataSettings({
  settings,
  save,
  onExport,
  onImportZip,
  onImportFolder,
}: {
  settings: AppSettings;
  save: (changes: Partial<Omit<AppSettings, "id">>) => Promise<void>;
  onExport: () => void;
  onImportZip: () => void;
  onImportFolder: () => void;
}) {
  const legacyModuleSettings = settings.enabledModules.length > 0 &&
    settings.enabledModules.every((id) => ["daily", "weekly", "projects", "ai"].includes(id));
  return (
    <section className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon"><Puzzle size={17} /></span>
        <div><h2>Modules & données</h2><p>Vos données restent dans ce navigateur et ne sont pas synchronisées dans le cloud. Exportez régulièrement une archive ZIP pour garder une sauvegarde indépendante.</p></div>
      </div>
      <div className="settings-module-list">
        {modules.map((module) => {
          const enabled = settings.enabledModules.includes(module.id) ||
            (legacyModuleSettings && (module.id === "editor" || module.id === "folder-sync"));
          return (
            <label className="settings-module-row" key={module.id}>
              <span><strong>{module.label}</strong><small>{module.description}</small></span>
              <input
                type="checkbox"
                role="switch"
                checked={enabled}
                onChange={(event) => {
                  const enabledModules = modules.flatMap((item) => {
                    const itemEnabled = item.id === module.id
                      ? event.target.checked
                      : settings.enabledModules.includes(item.id) ||
                        (legacyModuleSettings && (item.id === "editor" || item.id === "folder-sync"));
                    return itemEnabled ? [item.id] : [];
                  });
                  void save({ enabledModules });
                }}
              />
            </label>
          );
        })}
      </div>
      <div className="settings-data-block">
        <div className="settings-block-heading"><div><h3>Portabilité des données</h3><p>Les archives ne contiennent jamais votre clé API.</p></div></div>
        <div className="settings-data-actions">
          <button type="button" className="settings-data-card" onClick={onExport}><Download size={17} /><strong>Exporter tout en .zip</strong><small>Notes Markdown + métadonnées JSON</small></button>
          <button type="button" className="settings-data-card" onClick={onImportZip}><Upload size={17} /><strong>Importer une archive .zip</strong><small>Archive PKM, Obsidian ou Markdown</small></button>
          <button type="button" className="settings-data-card" onClick={onImportFolder}><FolderPlus size={17} /><strong>Importer un dossier local</strong><small>Markdown et fichiers texte, récursivement</small></button>
        </div>
      </div>
    </section>
  );
}

interface CategoryDraft {
  id?: string;
  name: string;
  color: string;
  icon: string;
  aiDescription: string;
}

interface TemplateDraft {
  id?: string;
  name: string;
  content: string;
  defaultCategoryId: string;
}

function emptyCategory(): CategoryDraft {
  return { name: "", color: "#3B82F6", icon: "Folder", aiDescription: "" };
}

function emptyTemplate(): TemplateDraft {
  return { name: "", content: "", defaultCategoryId: "" };
}
