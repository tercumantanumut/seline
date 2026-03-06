# Migration & Database Changes

## Schema Changes

### 1. Add `catalogId` column to `skills` table

```ts
// lib/db/migrations/add-skills-catalog-id.ts

import type { Database } from "better-sqlite3";

export function addSkillsCatalogId(db: Database) {
  db.exec(`
    ALTER TABLE skills ADD COLUMN catalogId TEXT;
  `);

  // Index for fast lookup: "is this catalog skill already installed?"
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_skills_catalog_id
    ON skills(catalogId) WHERE catalogId IS NOT NULL;
  `);
}
```

### 2. Update sourceType values

The current `sourceType` column accepts: `"conversation"`, `"manual"`, `"template"`.

We need to add `"catalog"` as a valid value. Since SQLite doesn't enforce CHECK constraints on ALTER, and the column is a TEXT type, no DDL change is needed — just update the Zod schema and TypeScript types.

```ts
// In lib/skills/types.ts
export type SkillSourceType = "conversation" | "manual" | "template" | "catalog";
```

```ts
// In lib/skills/validation.ts — update Zod schema
sourceType: z.enum(["conversation", "manual", "template", "catalog"]).optional()
```

### 3. Drizzle schema update

```ts
// In lib/db/sqlite-skills-schema.ts — add to skills table definition
catalogId: text("catalogId"),
```

---

## Data Migration

No data migration needed. Existing skills keep their current `sourceType` values. The `catalogId` column defaults to NULL for all existing rows.

---

## Backward Compatibility

| Area | Impact | Resolution |
|---|---|---|
| Existing skills | None | `catalogId` is NULL, `sourceType` unchanged |
| Existing API routes | None | New optional field, not breaking |
| Skill library component | Deprecated but functional | Old page redirects to new |
| Composer skill picker | Enhanced | Gets icons, no breaking changes |
| AI tools (run-skill, create-skill) | None | `sourceType: "catalog"` is just a new enum value |
| Plugin skills | None | Catalog skills coexist with plugin skills |

---

## Rollback Plan

If the migration needs to be rolled back:

1. Drop the `catalogId` column: `ALTER TABLE skills DROP COLUMN catalogId;`
   (SQLite 3.35+ supports DROP COLUMN)
2. Revert `sourceType` type union (remove "catalog")
3. Delete any skills where `sourceType = 'catalog'`
4. Restore old `/skills/library` page
