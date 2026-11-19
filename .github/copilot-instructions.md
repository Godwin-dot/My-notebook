# Règles globales du projet

- Consulte toujours `docs/cahier-des-charges.md` avant d'implémenter une entité ou une fonctionnalité.
- Toute nouvelle fonctionnalité métier doit être isolée dans `src/modules/<nom-du-module>/` et déclarée dans `src/core/module-registry.ts`. Ne couple pas les vues aux détails d'implémentation de Dexie ou de l'IA.
- Cette application reste local-first et souveraine : aucune requête réseau au démarrage et aucune authentification bloquante. Toute persistance passe par `src/lib/db/repositories.ts` avec Dexie.js et MiniSearch.
- L'IA reste strictement à la demande (BYOK). Ne lance aucun appel IA automatiquement ou sur `onChange` / `onSave`. Toute action IA requiert un clic explicite avec aperçu puis `Appliquer` / `Ignorer`.
- Respecte le design Vercel Dark : fond `#000000`, surfaces `#09090B` / `#111113`, bordures `1px solid #27272A`, sans ombres lourdes. Utilise uniquement les variables CSS d'accentuation.
- TypeScript strict obligatoire : aucun `any` implicite ou explicite, composants React fonctionnels typés, états vides et erreurs gérés explicitement.
