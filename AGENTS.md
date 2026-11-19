<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# My-Notebook — Gouvernance du projet

Application PKM & Productivité **Local-First** : Next.js 16, React 19, TypeScript, Tailwind CSS v4, Dexie.js, TipTap v3 et Serwist PWA.

## 1. Sources de vérité (à lire avant d'agir)

Toute intervention doit respecter, dans cet ordre :

1. `docs/cahier-des-charges.md` — spécifications fonctionnelles et techniques complètes. À consulter avant d'implémenter une entité, un écran ou une fonctionnalité.
2. `.github/copilot-instructions.md` — règles globales d'architecture et de design.
3. `.github/instructions/architecture-db.instructions.md` — modèles, repositories Dexie, index MiniSearch.
4. `.github/instructions/ui-design.instructions.md` — design system, icônes, responsive.

En cas de contradiction, le cahier des charges prime, puis les instructions les plus spécifiques. Signaler explicitement tout écart plutôt que de l'improviser.

## 2. Invariants non négociables

### Architecture strictement modulaire

- Chaque fonctionnalité métier vit dans `src/modules/<module>/` (`components/`, `hooks/`, `services/`, `extensions/`, `utils/`).
- Tout module doit être déclaré dans `src/core/module-registry.ts` et rester activable/désactivable via `AppSettings.enabledModules`.
- Les vues ne doivent pas dépendre des détails d'implémentation de Dexie ni de l'IA : passer par les repositories et les services.
- Types de données : uniquement les interfaces de `src/types/models.ts` (`Note`, `TaskItem`, `Category`, `NoteTemplate`, `AppSettings`).

### 100 % Local-First (souverain)

- Persistance exclusive via **Dexie.js** dans `src/lib/db/repositories.ts` ; recherche via **MiniSearch** (`src/lib/search/minisearch.ts`).
- **Aucun stockage serveur**, aucune requête réseau au démarrage, aucune authentification bloquante.
- Toute écriture/suppression Dexie passe par les repositories. Toute mutation de note met à jour `updatedAt` et resynchronise l'index MiniSearch.

### Design System Obsidian Bento

- Le rendu est piloté **uniquement** par les variables CSS : `--bg-primary`, `--bg-surface`, `--bg-elevated`, `--border-subtle`, `--accent-color`, `--accent-foreground`, `--radius-card`, `--radius-control`.
- Aucune couleur de surface codée en dur dans un composant. Aucune ombre portée lourde. Aucune bibliothèque d'icônes autre que `lucide-react`.
- Toute interface doit être utilisable au bureau **et** au mobile (zones tactiles ≥ 44 px, pas de débordement horizontal à 375/390 px).

### IA Human-in-the-Loop

- BYOK, **strictement à la demande** : aucun appel IA automatique, ni sur `onChange`, ni sur `onSave`.
- Toute action IA affiche un aperçu et exige une validation explicite **`Appliquer` / `Ignorer`**.
- Toute génération est annulable (request id / garde de version) et journalisée via `logActivity`.

## 3. Protocole d'audit obligatoire (fin de chaque étape)

À exécuter dans l'ordre, et à consigner dans le rapport d'étape :

```bash
npx tsc --noEmit
npm run lint
npm run build
```

- **0 erreur** exigée sur les trois commandes.
- Corriger la cause racine ; ne jamais désactiver une règle ESLint, ajouter un `any` ou un `@ts-ignore` pour faire passer l'audit.
- Vérifier ensuite le rendu mobile (`390 × 844`) : absence de scroll horizontal, navigation tactile fonctionnelle, panneaux en tiroir.

## 4. Commits & push

- Utiliser le skill `.opencode/skills/verify-commit-push/SKILL.md` avant tout commit/push.
- Format **Conventional Commits** : `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `style:`, `perf:`, `test:`.
- Un commit = un changement cohérent, en français, résumant précisément le périmètre.
- Pousser sur `origin main` uniquement après validation explicite de l'utilisateur.
