# Cahier des Charges — Espace de Travail Personnel Hybride (PKM & Productivité)

---

## 1. Présentation Générale du Projet

### 1.1 Contexte et Problématique
Les outils de gestion des connaissances (PKM) et de productivité se divisent généralement en deux extrêmes :
1. **Les éditeurs rapides centrés sur le texte brut** (ex: Obsidian), excellents pour l'écriture et les liens internes, mais dépourvus de vues de planification structurées natives (semainier, suivi de projets).
2. **Les espaces de travail tout-en-un** (ex: Notion), riches en vues, mais souvent lourds, lents au démarrage, fortement dépendants d'une connexion cloud et peu respectueux de la souveraineté locale des données.

L'objectif de ce projet est de concevoir une **plateforme web PWA personnelle, minimaliste, ultra-rapide et modulaire**. Elle fusionne la fluidité d'écriture du Markdown avec la puissance d'organisation par métadonnées structurées, tout en intégrant une **intelligence artificielle ubiquitaire mais strictement déclenchée à la demande** via clé API personnelle (BYOK - *Bring Your Own Key*).

### 1.2 Proposition de Valeur & Principes Directeurs
- **Zéro friction ("Capture-First")** : Ouverture instantanée (< 100 ms), prise de note immédiate et raccourcis clavier globaux.
- **Souveraineté & Vitesse ("Local-First")** : Stockage local natif dans le navigateur pour une exécution 100 % hors-ligne, couplé à l'import/export de dossiers Markdown locaux.
- **IA Ubiquitaire & On-Demand (*Human-in-the-Loop*)** : L'application est 100 % autonome et fonctionnelle sans IA. L'IA est présente sur tous les modules via des boutons d'autorisation explicites (`✦`), préservant les quotas des clés API gratuites et évitant toute modification automatique non désirée.
- **Évolutivité Modulaire ("Core + Plugins")** : Architecture découplée permettant d'activer, désactiver ou greffer de nouvelles fonctionnalités au fil des besoins sans refondre le socle.
- **Esthétique Haute Précision** : Interface sombre inspirée de Vercel / Geist UI, structurée par des bordures fines et rehaussée d'accents chromatiques personnalisables.

### 1.3 Cibles et Périmètre d'Évolution
- **Version 1 (MVP)** : Usage strictement personnel (mono-utilisateur local, zéro authentification bloquante au lancement).
- **Évolutions futures (V2+)** : Socle conçu pour accueillir ultérieurement une synchronisation cloud optionnelle (multi-appareils temps réel) ainsi qu'un mode de partage de pages publiques en lecture seule.

---

## 2. Architecture de Stockage : Arbitrage "Local-First"

Pour garantir une réactivité maximale sur PC comme sur mobile (PWA) sans coût d'hébergement serveur ni dépendance réseau au démarrage, l'application adopte une architecture **Hybride Local-First** :

1. **Base de données locale embarquée (IndexedDB via Dexie.js)** :
   - L'intégralité des notes, propriétés, tâches, catégories et paramètres est stockée localement sur l'appareil.
   - Temps de lecture/écriture quasi instantané et fonctionnement **100 % hors-ligne**.
2. **Pont avec le système de fichiers local (File System Access API + Archives ZIP)** :
   - **Sur Desktop ( navigateurs Chromium)** : Connexion directe à un dossier local du disque dur pour importer des arborescences existantes (`.md`, `.txt`) et synchroniser des sauvegardes automatiques en Markdown pur.
   - **Sur Mobile / Multi-navigateurs** : Importation et exportation complète sous forme d'archive `.zip` standardisée (fichiers Markdown + entêtes YAML).
3. **Confidentialité stricte** : Aucune donnée ni clé API ne transite par un serveur intermédiaire. Les appels IA s'effectuent directement depuis le client vers le fournisseur choisi par l'utilisateur.

---

## 3. Spécifications Fonctionnelles Détaillées

### 3.1 Module 1 : Noyau d'Édition Hybride (Markdown + Propriétés)
- **Éditeur structuré fluide** :
  - Rendu Markdown en temps réel (titres H1-H3, listes à puces/numérotées, listes de tâches interactives, blocs de code avec coloration syntaxique, citations, appels/callouts, tableaux légers).
  - Menu de commandes rapides déclenché par `/` (*Slash Commands* façon Notion/Google Docs) pour insérer rapidement des blocs ou déclencher une action IA.
- **Bandeau de Propriétés (Frontmatter visuel)** :
  - En-tête compact et masquable permettant d'attacher des métadonnées typées à chaque document :
    - `Catégorie` (dossier/domaine principal)
    - `Statut` (`Inbox`, `Brouillon`, `En cours`, `En attente`, `Terminé`, `Archivé`)
    - `Priorité` (`Basse`, `Normale`, `Haute`)
    - `Tags` (étiquettes multiples avec autocomplétion)
    - `Date cible` (échéance optionnelle)
- **Réseau de connaissances (`[[Liens bidirectionnels]]`)** :
  - Autocomplétion instantanée lors de la frappe de `[[` pour lier deux notes.
  - Panneau contextuel affichant automatiquement les **Backlinks** (notes qui référencent le document actif).

### 3.2 Module 2 : Centralisation des Projets & Boîte à Idées (Inbox)
- **Quick Capture (`Ctrl/Cmd + K` ou `Alt + N`)** : Modale flottante accessible depuis n'importe quelle vue pour capturer une idée brute en quelques secondes directement dans l'*Inbox*.
- **Gestion de Projets** :
  - Toute note peut être promue au rang de **Projet** (`isProject: true`), centralisant son cahier des charges, ses sous-notes liées et sa liste de tâches.
  - Bascule instantanée entre **Vue Liste**, **Vue Tableau** (triable par statut/priorité/catégorie) et **Vue Grille** (cartes).

### 3.3 Module 3 : Planification Hebdomadaire & Journal Quotidien
- **Programme de la Semaine (Weekly Planner)** :
  - Vue divisée en 7 colonnes (Lundi à Dimanche) accompagnée d'une colonne latérale *"Backlog / À planifier"*.
  - Organisation par glisser-déposer (*Drag & Drop*) des tâches et notes sur les jours de la semaine.
  - **Synchronisation bidirectionnelle** : cocher une tâche dans le semainier met automatiquement à jour son état dans la note projet d'origine (et inversement).
- **Journal Quotidien ("Daily Notes")** :
  - Ouverture/création en 1 clic de la page du jour (`YYYY-MM-DD`) générée à partir d'un modèle personnalisable (ex: *Priorités du jour*, *Journal / Notes libres*, *Bilan du soir*).
  - Navigation rapide jour précédent / aujourd'hui / jour suivant.

### 3.4 Module 4 : Importateur de Dossiers Existants
- **Ingestion d'arborescence** :
  - Sélection d'un dossier local complet contenant des fichiers `.md` ou `.txt`.
  - Conversion récursive en notes de la plateforme : les sous-dossiers sont automatiquement mappés vers des **Catégories** ou des **Notes parentes**, préservant la structure existante de l'utilisateur.
  - Extraction automatique des tags existants (`#tag`) ou du frontmatter YAML s'ils sont présents dans les fichiers sources.

### 3.5 Module 5 : Intelligence Artificielle Ubiquitaire & On-Demand
L'IA agit comme un copilote transversal présent sur tous les modules, mais **strictement subordonné à l'autorisation explicite de l'utilisateur** (1 clic = 1 requête API).

#### Points d'intervention par module :
1. **Éditeur de texte (Sélection ou menu `/`)** :
   - `✦ Structurer en plan` : Transforme un brouillon en vrac en document hiérarchisé avec titres et listes.
   - `✦ Reformuler / Corriger` : Améliore la clarté ou corrige l'orthographe d'un passage sélectionné.
   - `✦ Développer / Continuer` : Propose la suite logique d'un paragraphe ou d'une idée.
2. **Propriétés & Inbox (Classement intelligent)** :
   - `✦ Auto-classer cette note` : Analyse le texte et suggère la **catégorie** la plus adaptée parmi celles existantes, 2 à 4 **tags** pertinents et un **résumé** en une phrase.
   - `✦ Convertir en fiche Projet` : Transforme une idée brute de l'Inbox en note projet structurée avec un découpage en étapes/tâches actionnables.
3. **Semainier (Weekly Planner)** :
   - `✦ Suggérer un planning` : Analyse les tâches du *Backlog* et leurs priorités pour proposer une répartition équilibrée sur les jours libres de la semaine.
4. **Journal Quotidien (Daily Note)** :
   - `✦ Générer le bilan du jour` : Synthétise les notes créées et les tâches accomplies dans la journée pour rédiger un résumé de fin de journée.
5. **Importation par lot (Optionnel)** :
   - `✦ Analyser le dossier importé` : Permet de lancer manuellement un tri/taguage sur une sélection de fichiers importés (avec estimation préalable du nombre de requêtes).

#### Garde-fous techniques et ergonomiques :
- **Validation avant écriture (Aperçu / Diff)** : L'IA n'écrase jamais directement le contenu existant. Ses propositions s'affichent dans un encart dédié avec deux actions : **[Appliquer]** ou **[Ignorer]**.
- **Mode dégradé élégant (*Graceful Degradation*)** : Si aucune clé API n'est configurée ou si l'appareil est hors-ligne, l'application fonctionne normalement ; les boutons `✦` affichent simplement un état désactivé avec un lien direct vers la configuration API.
- **Protection des quotas gratuits** : Aucune requête en arrière-plan au clavier ou à la sauvegarde ; gestion claire des erreurs de limite de débit (`HTTP 429`).

### 3.6 Module 6 : Centre de Paramètres & Personnalisation (`/settings`)
Onglet dédié structuré en 4 panneaux :
1. **Configuration IA (BYOK)** :
   - Choix du fournisseur : **Google Gemini** (par défaut), **OpenAI**, **Anthropic**, ou **Endpoint personnalisé** (compatible OpenAI / Ollama local).
   - Champ sécurisé pour la **Clé API** (stockée localement dans IndexedDB, masquée par défaut).
   - Sélecteur de modèle (ex: `gemini-2.5-flash` recommandé pour la rapidité et le quota gratuit, `gemini-2.5-pro` pour les analyses complexes) + bouton *"Tester la clé API"*.
   - Éditeur du **Prompt Système de classification** pour personnaliser les règles de tri de l'IA.
2. **Apparence & Thème** :
   - Socle sombre haute précision inspiré de Vercel (`#000000` / `#09090B`).
   - **Sélecteur de couleur d'accentuation clé** (ex: Bleu électrique `#3B82F6`, Émeraude `#10B981`, Ambre `#F59E0B`, Violet `#A855F7`, Cyan `#06B6D4`) appliquée dynamiquement aux états actifs, boutons principaux, indicateurs IA `✦` et barres de progression.
   - Choix de la typographie (Sans-serif moderne type *Geist/Inter*, Serif éditorial pour l'écriture longue, Monospace) et de la largeur maximale de la page.
3. **Catégories & Modèles (Templates)** :
   - Création, édition et suppression des **Catégories** (nom, icône, couleur associée, et *description sémantique* utilisée par l'IA pour savoir quelles notes y ranger).
   - Gestion des **Modèles de notes** (Journal quotidien, Fiche Projet, Note rapide).
4. **Modules & Données** :
   - Interrupteurs d'activation/désactivation des modules (ex: afficher/masquer le Semainier ou le Journal).
   - Exportation complète en `.zip` et configuration du dossier de sauvegarde automatique local.

---

## 4. Direction Artistique & Ergonomie (UX/UI)

### 4.1 Système Visuel ("Vercel Dark + Key Accents")
- **Arrière-plans** :
  - Fond principal : Noir profond `#000000`
  - Surfaces secondaires (sidebar, cartes, modales) : Gris carbone `#09090B` / `#111113`
  - Bordures structurelles : Gris subtil `1px solid #27272A` (séparation nette sans ombres portées lourdes).
- **Typographie** : Contraste élevé (`#FAFAFA` pour le texte principal, `#A1A1AA` pour les métadonnées et textes secondaires).
- **Code Couleur Sémantique** :
  - La **couleur d'accentuation utilisateur** pilote l'interface active et les déclencheurs IA (`✦`).
  - Chaque **Catégorie** dispose d'une pastille chromatique distincte permettant d'identifier visuellement le domaine d'une note au premier coup d'œil dans l'Inbox ou le Semainier.

### 4.2 Organisation Spatiale (3 Colonnes Adaptatives)
1. **Barre latérale gauche (rétractable)** :
   - Raccourcis fixes : *Aujourd'hui (Journal)*, *Semainier*, *Inbox (Idées)*, *Projets*, *Toutes les notes*.
   - Liste des *Catégories* avec compteur de notes.
   - Accès bas de barre : *Importer un dossier* et *Paramètres*.
2. **Espace central (Canvas d'écriture)** :
   - Barre supérieure épurée : fil d'Ariane, bouton `✦ Classer / Actions IA`, bouton panneau droit.
   - Bandeau de propriétés compact.
   - Zone d'édition centrée, sans distraction.
3. **Panneau latéral droit (contextuel, masquable)** :
   - Table des matières générée automatiquement à partir des titres (`H1`-`H3`).
   - Liste des *Backlinks* (notes liées).
   - Espace d'affichage des résultats IA avant validation.

---

## 5. Architecture & Spécifications Techniques

### 5.1 Stack Technique Recommandée
- **Framework** : **Next.js (App Router)** + **TypeScript** (configuration exportable en PWA statique/client-first).
- **Interface & Styles** : **Tailwind CSS** + primitives accessibles **Radix UI / shadcn/ui** (variables CSS dynamiques pour la couleur d'accentuation).
- **Éditeur Riche** : **TipTap** (ProseMirror) avec extensions Markdown, Slash Commands (`/`) et parser de liens internes `[[wikilinks]]`.
- **Persistance Locale & Recherche** : **Dexie.js** (IndexedDB) couplé à **MiniSearch** pour la recherche plein texte instantanée (< 15 ms).
- **Intégration IA** : Abstraction unifiée (`AIService`) s'appuyant sur `@google/genai` et une interface compatible OpenAI REST API.
- **PWA & Hors-ligne** : **Serwist** (`@serwist/next`) pour la mise en cache des assets et l'installation native sur Desktop et Android.

### 5.2 Modèle de Données (Schéma Dexie / TypeScript)

```typescript
export type NoteStatus = 'inbox' | 'draft' | 'active' | 'waiting' | 'done' | 'archived';
export type PriorityLevel = 'low' | 'medium' | 'high';

export interface Note {
  id: string;                     // UUID v4
  title: string;                  // Titre du document
  content: string;                // Contenu Markdown / JSON TipTap
  summary?: string;               // Résumé court (généré à la demande ou manuel)
  categoryId: string | null;      // Référence vers Category
  parentId: string | null;        // Pour hiérarchie de sous-pages
  status: NoteStatus;
  priority: PriorityLevel;
  tags: string[];                 // Étiquettes
  isProject: boolean;             // Définit si la note apparaît dans la vue Projets
  isDaily: boolean;               // Définit si c'est une entrée de journal
  dailyDate?: string;             // Format YYYY-MM-DD (indexé)
  customFields: Record<string, unknown>; // Extensibilité future sans migration lourde
  createdAt: number;              // Timestamp
  updatedAt: number;              // Timestamp
}

export interface TaskItem {
  id: string;                     // UUID v4
  noteId: string | null;          // Note/Projet d'origine (null si tâche volante)
  text: string;                   // Libellé de la tâche
  isCompleted: boolean;
  scheduledDate: string | null;   // Format YYYY-MM-DD (placement dans le semainier)
  order: number;                  // Position dans la colonne du jour
  createdAt: number;
}

export interface Category {
  id: string;                     // UUID v4
  name: string;                   // Ex: "Développement", "Écriture", "Cours"
  color: string;                  // Code Hex (ex: "#3B82F6")
  icon: string;                   // Identifiant icône Lucide
  aiDescription: string;          // Contexte fourni à l'IA pour guider le classement
  order: number;
}

export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  defaultCategoryId?: string;
}

export interface AppSettings {
  id: 'default';
  aiProvider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  apiKey: string;                 // Stockée localement uniquement
  aiModel: string;                // Ex: "gemini-2.5-flash"
  customEndpoint?: string;        // Pour modèles locaux (Ollama) ou proxy
  classificationPrompt: string;   // Prompt personnalisable
  accentColor: string;            // Couleur clé choisie par l'utilisateur
  fontFamily: 'sans' | 'serif' | 'mono';
  editorWidth: 'narrow' | 'medium' | 'wide';
  enabledModules: string[];       // Ex: ["daily", "weekly", "projects", "ai"]
}
```

### 5.3 Contrat du Service IA (`AIService`)
Pour garantir l'isolation, la maîtrise des coûts et l'interchangeabilité des fournisseurs API, toutes les interactions passent par une couche unique :

```typescript
export interface AIClassificationResult {
  suggestedCategoryId: string | null;
  suggestedTags: string[];
  summary: string;
  suggestedLinks: string[]; // Titres de notes existantes pertinentes
}

export interface AIService {
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  classifyNote(note: Note, categories: Category[], existingTitles: string[]): Promise<AIClassificationResult>;
  transformText(text: string, instruction: 'structure' | 'rewrite' | 'continue' | 'summarize'): Promise<string>;
  convertIdeaToProject(rawText: string): Promise<{ title: string; content: string; tasks: string[] }>;
  suggestWeeklySchedule(backlogTasks: TaskItem[], weekDates: string[]): Promise<Array<{ taskId: string; suggestedDate: string }>>;
  generateDailyReview(dailyNote: Note, completedTasks: TaskItem[]): Promise<string>;
}
```

### 5.4 Architecture Modulaire (Extensibilité)
Chaque module fonctionnel est structuré de manière autonome sous `src/modules/<module-name>/` et enregistré via un registre central (`ModuleRegistry`) :
- `src/modules/editor/` (Noyau Markdown, propriétés, wikilinks)
- `src/modules/inbox-projects/` (Quick capture, vues projets)
- `src/modules/weekly-planner/` (Semainier drag-and-drop & tâches)
- `src/modules/daily-journal/` (Journal quotidien & templates)
- `src/modules/folder-sync/` (Importateur local & export ZIP)
- `src/modules/ai-copilot/` (Service BYOK, modales de validation, prompts)

---

## 6. Plan de Développement & Livrables (Roadmap)

### Étape 1 : Socle Local-First, Design System & Éditeur (MVP 1)
- Initialisation Next.js (TypeScript), Tailwind CSS, variables de thème sombre style Vercel et configuration PWA.
- Mise en place de la base IndexedDB (Dexie.js) et de la recherche plein texte (MiniSearch).
- Développement de l'interface 3 colonnes, de la palette rapide `Ctrl+K` et de l'éditeur TipTap (Markdown, Slash Commands, Propriétés et `[[wikilinks]]`).
- **Livrable** : Application fonctionnelle hors-ligne permettant de créer, lier et rechercher des notes instantanément.

### Étape 2 : Journal Quotidien & Programme de la Semaine (MVP 2)
- Implémentation du module *Daily Notes* avec génération par modèle.
- Implémentation de la vue *Semainier* (7 jours + backlog) avec glisser-déposer et synchronisation des tâches avec les notes projets.
- **Livrable** : Espace complet de prise de notes et de planification hebdomadaire sans IA.

### Étape 3 : Centre de Paramètres, Import Dossiers & Copilote IA On-Demand (MVP 3)
- Création de l'onglet `/settings` (couleur clé, typographie, gestion des catégories, configuration BYOK clé API).
- Implémentation de l'importateur de dossiers `.md`/`.txt` et de l'export `.zip`.
- Intégration des boutons d'action IA contextuels (`✦`) avec aperçu avant validation (`Appliquer` / `Ignorer`) sur l'éditeur, le classement de notes, le semainier et le journal.
- **Livrable** : Plateforme complète, personnalisable et augmentée par IA à la demande.