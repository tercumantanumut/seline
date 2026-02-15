import { sqliteTable, text, integer, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
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
    triggerExamples: text("trigger_examples", { mode: "json" }).default("[]").notNull(),
    category: text("category").default("general").notNull(),
    version: integer("version").default(1).notNull(),
    copiedFromSkillId: text("copied_from_skill_id").references((): AnySQLiteColumn => skills.id, { onDelete: "set null" }),
    copiedFromCharacterId: text("copied_from_character_id").references(() => characters.id, { onDelete: "set null" }),
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
    userUpdatedIdx: index("idx_skills_user_updated").on(table.userId, table.updatedAt),
    userCategoryIdx: index("idx_skills_user_category").on(table.userId, table.category),
  })
);

export const skillVersions = sqliteTable(
  "skill_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    skillId: text("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
    version: integer("version").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    inputParameters: text("input_parameters", { mode: "json" }).default("[]").notNull(),
    toolHints: text("tool_hints", { mode: "json" }).default("[]").notNull(),
    description: text("description"),
    changeReason: text("change_reason"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    bySkillVersionIdx: index("idx_skill_versions_skill_version").on(table.skillId, table.version),
    bySkillCreatedIdx: index("idx_skill_versions_skill_created").on(table.skillId, table.createdAt),
  })
);

export const skillTelemetryEvents = sqliteTable(
  "skill_telemetry_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userEventIdx: index("idx_skill_telemetry_user_event").on(table.userId, table.eventType, table.createdAt),
    skillEventIdx: index("idx_skill_telemetry_skill_event").on(table.skillId, table.eventType, table.createdAt),
  })
);

export const skillsRelations = relations(skills, ({ one, many }) => ({
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
  copiedFromSkill: one(skills, {
    fields: [skills.copiedFromSkillId],
    references: [skills.id],
    relationName: "skills_copied_from_skill",
  }),
  copiedFromCharacter: one(characters, {
    fields: [skills.copiedFromCharacterId],
    references: [characters.id],
  }),
  versions: many(skillVersions),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, {
    fields: [skillVersions.skillId],
    references: [skills.id],
  }),
}));

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillVersion = typeof skillVersions.$inferSelect;
export type NewSkillVersion = typeof skillVersions.$inferInsert;
export type SkillTelemetryEvent = typeof skillTelemetryEvents.$inferSelect;
export type NewSkillTelemetryEvent = typeof skillTelemetryEvents.$inferInsert;

export interface SkillInputParameter {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
}
