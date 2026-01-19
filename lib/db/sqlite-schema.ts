import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// Helper for UUID generation (SQLite doesn't have native UUID)
const uuidDefault = sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`;

// Helper for timestamp default
const timestampDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// ============================================================================
// USERS TABLE
// ============================================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  externalId: text("external_id"),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// SESSIONS TABLE
// ============================================================================

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  title: text("title"),
  status: text("status", { enum: ["active", "archived", "deleted"] }).default("active").notNull(),
  providerSessionId: text("provider_session_id"),
  summary: text("summary"),
  summaryUpToMessageId: text("summary_up_to_message_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// MESSAGES TABLE
// ============================================================================

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  parentId: text("parent_id"),
  role: text("role", { enum: ["system", "user", "assistant", "tool"] }).notNull(),
  content: text("content", { mode: "json" }).notNull(),
  model: text("model"),
  toolName: text("tool_name"),
  toolCallId: text("tool_call_id"),
  isCompacted: integer("is_compacted", { mode: "boolean" }).default(false).notNull(),
  tokenCount: integer("token_count"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// TOOL RUNS TABLE
// ============================================================================

export const toolRuns = sqliteTable("tool_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  messageId: text("message_id").references(() => messages.id),
  toolName: text("tool_name").notNull(),
  args: text("args", { mode: "json" }).notNull(),
  result: text("result", { mode: "json" }),
  status: text("status", { enum: ["pending", "running", "succeeded", "failed", "cancelled"] }).default("pending").notNull(),
  error: text("error"),
  startedAt: text("started_at").default(sql`(datetime('now'))`).notNull(),
  completedAt: text("completed_at"),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// WEB BROWSE ENTRIES TABLE
// ============================================================================

export const webBrowseEntries = sqliteTable("web_browse_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentLength: integer("content_length").notNull(),
  images: text("images", { mode: "json" }).default("[]").notNull(),
  ogImage: text("og_image"),
  fetchedAt: text("fetched_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// ============================================================================
// IMAGES TABLE
// ============================================================================

export const images = sqliteTable("images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  messageId: text("message_id").references(() => messages.id),
  toolRunId: text("tool_run_id").references(() => toolRuns.id),
  role: text("role", { enum: ["upload", "reference", "generated", "mask", "tile"] }).notNull(),
  localPath: text("local_path").notNull(), // Changed from s3Key - local file path
  url: text("url").notNull(), // Will be file:// URL for local files
  width: integer("width"),
  height: integer("height"),
  format: text("format"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  messages: many(messages),
  toolRuns: many(toolRuns),
  webBrowseEntries: many(webBrowseEntries),
  images: many(images),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
  parent: one(messages, {
    fields: [messages.parentId],
    references: [messages.id],
    relationName: "message_parent",
  }),
  children: many(messages, { relationName: "message_parent" }),
  toolRuns: many(toolRuns),
  images: many(images),
}));

export const toolRunsRelations = relations(toolRuns, ({ one, many }) => ({
  session: one(sessions, {
    fields: [toolRuns.sessionId],
    references: [sessions.id],
  }),
  message: one(messages, {
    fields: [toolRuns.messageId],
    references: [messages.id],
  }),
  images: many(images),
}));

export const webBrowseEntriesRelations = relations(webBrowseEntries, ({ one }) => ({
  session: one(sessions, {
    fields: [webBrowseEntries.sessionId],
    references: [sessions.id],
  }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  session: one(sessions, {
    fields: [images.sessionId],
    references: [sessions.id],
  }),
  message: one(messages, {
    fields: [images.messageId],
    references: [messages.id],
  }),
  toolRun: one(toolRuns, {
    fields: [images.toolRunId],
    references: [toolRuns.id],
  }),
}));

// Re-export character schema
export * from "./sqlite-character-schema";

// Re-export observability schema (agent runs, events, prompt versioning)
export * from "./sqlite-observability-schema";

// Re-export schedule schema (scheduled tasks and runs)
export * from "./sqlite-schedule-schema";

// ============================================================================
// TYPES
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ToolRun = typeof toolRuns.$inferSelect;
export type NewToolRun = typeof toolRuns.$inferInsert;
export type WebBrowseEntry = typeof webBrowseEntries.$inferSelect;
export type NewWebBrowseEntry = typeof webBrowseEntries.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;

