import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions } from "./sqlite-schema";

// ============================================================================
// VOICE HISTORY TABLE
// ============================================================================

export const voiceHistory = sqliteTable(
  "voice_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sessionId: text("session_id")
      .references(() => sessions.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    inputText: text("input_text").notNull(),
    outputText: text("output_text").notNull(),
    action: text("action").notNull(),
    language: text("language"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    metadata: text("metadata").default("{}").notNull(),
  },
  (table) => ({
    idxVoiceHistoryUserCreated: index("idx_voice_history_user_created").on(table.userId, table.createdAt),
    idxVoiceHistorySessionCreated: index("idx_voice_history_session_created").on(table.sessionId, table.createdAt),
  })
);

// ============================================================================
// VOICE DICTIONARY TABLE
// ============================================================================

export const voiceDictionary = sqliteTable(
  "voice_dictionary",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    word: text("word").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    idxVoiceDictionaryUserWord: uniqueIndex("idx_voice_dictionary_user_word").on(table.userId, table.word),
  })
);

// ============================================================================
// RELATIONS
// ============================================================================

export const voiceHistoryRelations = relations(voiceHistory, ({ one }) => ({
  user: one(users, {
    fields: [voiceHistory.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [voiceHistory.sessionId],
    references: [sessions.id],
  }),
}));

export const voiceDictionaryRelations = relations(voiceDictionary, ({ one }) => ({
  user: one(users, {
    fields: [voiceDictionary.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type VoiceHistory = typeof voiceHistory.$inferSelect;
export type NewVoiceHistory = typeof voiceHistory.$inferInsert;
export type VoiceDictionary = typeof voiceDictionary.$inferSelect;
export type NewVoiceDictionary = typeof voiceDictionary.$inferInsert;
