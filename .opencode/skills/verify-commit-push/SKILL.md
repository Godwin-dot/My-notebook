---
name: verify-commit-push
description: Vérifie l'intégrité du projet (TypeScript, ESLint, build), contrôle l'état Git, puis prépare un commit Conventional Commits et pousse sur origin main uniquement après validation de l'utilisateur. À utiliser avant tout commit ou push sur My-Notebook.
---

# Vérifier, commiter et pousser proprement

Procédure stricte et ordonnée. **Ne jamais sauter une étape** et **s'arrêter immédiatement** dès qu'une vérification échoue.

## 1. Vérifications techniques (bloquantes)

Exécuter, dans cet ordre, depuis la racine du dépôt :

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Règles :

- Si une commande retourne un code de sortie non nul : **stopper**. Corriger la cause racine, puis relancer la séquence complète depuis le début.
- Ne jamais contourner une erreur avec `any`, `@ts-ignore`, `eslint-disable` ou en supprimant un test.
- Ne pas commiter tant que les trois commandes ne passent pas avec **0 erreur**.
- Consigner les résultats (succès/échec) dans le rapport d'étape.

## 2. Contrôle de l'état Git

```bash
git status
git diff --check
git diff --stat
```

Vérifier explicitement qu'aucun élément indésirable n'est suivi ou sur le point de l'être :

- fichiers temporaires (`*.tmp`, `*.log`, `tsconfig.tsbuildinfo` non ignoré, `.next/`) ;
- secrets et fichiers d'environnement (`.env*`, clés API, tokens) ;
- artefacts de build, dumps, archives, fichiers de l'éditeur (`.idea/`, `.vscode/` non partagé) ;
- modifications hors périmètre de l'étape en cours.

`git diff --check` doit ne rien signaler (pas d'espaces blancs parasites ni de marqueurs de conflit).

Lister les fichiers réellement concernés, par exemple :

```bash
git status --short
```

## 3. Commit ciblé (Conventional Commits)

1. Proposer à l'utilisateur le périmètre exact du commit et un message.
2. Effectuer un `git add` **fichier par fichier** (jamais `git add -A` ni `git add .` sans contrôle) :

```bash
git add AGENTS.md
git add .opencode/skills/verify-commit-push/SKILL.md
git add src/components/layout/MobileBottomNav.tsx
# ...
```

3. Créer le commit :

```bash
git commit -m "feat: refonte mobile-first et gouvernance OpenCode"
```

Contraintes de message :

- Préfixe obligatoire : `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `style:`, `perf:` ou `test:`.
- Impératif présent, en français, ≤ 72 caractères pour le titre.
- Le titre résume précisément les changements ; le corps (optionnel) détaille les points importants.

## 4. Push sur `origin main` (sur validation explicite uniquement)

- **Ne jamais pousser sans demande ou validation explicite de l'utilisateur.**
- Vérifier la branche courante et la propreté de l'arbre :

```bash
git branch --show-current
git status --short
```

- Si la branche n'est pas `main`, demander confirmation avant tout merge/rebranchement.
- Pousser :

```bash
git push origin main
```

## 5. Confirmation finale

Afficher et confirmer :

```bash
git log --oneline -1
git status --short
git rev-parse --short HEAD
```

L'arbre de travail doit être propre (`git status --short` vide) et le commit local doit correspondre au commit poussé sur `origin/main`.

## Rapport final attendu

- Résultat des trois vérifications (`tsc`, `lint`, `build`).
- Liste des fichiers ajoutés/modifiés et du message de commit.
- Hash du commit, branche et statut du push vers `origin main`.
- Tout avertissement résiduel à traiter lors de l'étape suivante.
