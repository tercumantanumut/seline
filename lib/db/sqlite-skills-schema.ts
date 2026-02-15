import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions } from "./sqlite-schema";
import { characters } from "./sqlite-character-schema";

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    characterId: text("character_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    promptTemplate: text("prompt_template").notNull(),
    inputParameters: text("input_parameters", { mode: "json" }).default("[]").notNull(),
    toolHints: text("tool_hints", { mode: "json" }).default("[]").notNull(),
    sourceType: text("source_type", { enum: ["conversation", "manual", "template"] }).default("conversation").notNull(),
    sourceSessionId: text("source_session_id").references(() => sessions.id, { onDelete: "set null" }),
    runCount: integer("run_count").default(0).notNull(),
    successCount: integer("success_count").default(0).notNull(),
    lastRunAt: text("last_run_at"),
    status: text("status", { enum: ["draft", "active", "archived"] }).default("active").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userCharacterStatusIdx: index("idx_skills_user_character").on(table.userId, table.characterId, table.status),
    characterNameIdx: index("idx_skills_character_name").on(table.characterId, table.name),
  })
);

export const skillsRelations = relations(skills, ({ one }) => ({
  user: one(users, {
    fields: [skills.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [skills.characterId],
    references: [characters.id],
  }),
  sourceSession: one(sessions, {
    fields: [skills.sourceSessionId],
    references: [sessions.id],
  }),
}));

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export interface SkillInputParameter {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
}
