---
applyTo: "src/lib/**,src/modules/**,src/types/**"
---

- Utilise exclusivement les interfaces exactes définies dans `src/types/models.ts` : `Note`, `TaskItem`, `Category`, `NoteTemplate` et `AppSettings`.
- Toute écriture ou suppression Dexie doit passer par `src/lib/db/repositories.ts`.
- Toute mutation de note doit mettre à jour `updatedAt` et resynchroniser l'index MiniSearch.
