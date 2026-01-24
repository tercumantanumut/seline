import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./sqlite-schema";

// ============================================================================
// MAIN CHARACTERS TABLE
// ============================================================================

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),

  // Basic Info
  name: text("name").notNull(),
  displayName: text("display_name"),
  tagline: text("tagline"),
  status: text("status", { enum: ["draft", "active", "archived"] }).default("draft").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),

  // Timestamps
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  lastInteractionAt: text("last_interaction_at"),

  // Metadata
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
});

// ============================================================================
// CHARACTER IMAGES TABLE
// ============================================================================

export const characterImages = sqliteTable("character_images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  characterId: text("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),

  imageType: text("image_type", { enum: ["portrait", "full_body", "expression", "outfit", "scene", "avatar"] }).notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
  localPath: text("local_path").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  format: text("format"),
  prompt: text("prompt"),
  seed: integer("seed"),
  generationModel: text("generation_model"),
  sortOrder: integer("sort_order").default(0).notNull(),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// AGENT DOCUMENTS TABLE
// ============================================================================

export const agentDocuments = sqliteTable("agent_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  characterId: text("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),
  originalFilename: text("original_filename").notNull(),
  contentType: text("content_type").notNull(),
  extension: text("extension"),
  storagePath: text("storage_path").notNull(),
  sizeBytes: integer("size_bytes"),
  title: text("title"),
  description: text("description"),
  pageCount: integer("page_count"),
  sourceType: text("source_type"),
  status: text("status", { enum: ["pending", "ready", "failed"] }).default("pending").notNull(),
  tags: text("tags", { mode: "json" }).default("[]").notNull(),
  metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
  embeddingModel: text("embedding_model"),
  lastIndexedAt: text("last_indexed_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// AGENT DOCUMENT CHUNKS TABLE
// ============================================================================

export const agentDocumentChunks = sqliteTable("agent_document_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id")
    .references(() => agentDocuments.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  characterId: text("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  tokenCount: integer("token_count"),
  embedding: text("embedding", { mode: "json" }),
  embeddingModel: text("embedding_model"),
  embeddingDimensions: integer("embedding_dimensions"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// AGENT SYNC FOLDERS TABLE
// ============================================================================

export const agentSyncFolders = sqliteTable(
  "agent_sync_folders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    characterId: text("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    folderPath: text("folder_path").notNull(),
    displayName: text("display_name"),
    isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
    recursive: integer("recursive", { mode: "boolean" }).default(true).notNull(),
    includeExtensions: text("include_extensions", { mode: "json" }).default('["md","txt","pdf","html"]').notNull(),
    excludePatterns: text("exclude_patterns", { mode: "json" }).default('["node_modules",".*",".git"]').notNull(),
    status: text("status", { enum: ["pending", "syncing", "synced", "error", "paused"] }).default("pending").notNull(),
    lastSyncedAt: text("last_synced_at"),
    lastError: text("last_error"),
    fileCount: integer("file_count").default(0),
    chunkCount: integer("chunk_count").default(0),
    embeddingModel: text("embedding_model"), // Track which embedding model was used for sync
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userIdx: index("agent_sync_folders_user_idx").on(table.userId),
    characterIdx: index("agent_sync_folders_character_idx").on(table.characterId),
    primaryIdx: index("agent_sync_folders_primary_idx").on(table.characterId, table.isPrimary),
  })
);

// ============================================================================
// AGENT SYNC FILES TABLE
// ============================================================================

export const agentSyncFiles = sqliteTable("agent_sync_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  folderId: text("folder_id")
    .references(() => agentSyncFolders.id, { onDelete: "cascade" })
    .notNull(),
  characterId: text("character_id")
    .references(() => characters.id, { onDelete: "cascade" })
    .notNull(),
  filePath: text("file_path").notNull(),
  relativePath: text("relative_path").notNull(),
  contentHash: text("content_hash"),
  sizeBytes: integer("size_bytes"),
  modifiedAt: text("modified_at"),
  status: text("status", { enum: ["pending", "indexed", "error"] }).default("pending").notNull(),
  vectorPointIds: text("vector_point_ids", { mode: "json" }).default("[]"),
  chunkCount: integer("chunk_count").default(0),
  lastIndexedAt: text("last_indexed_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const charactersRelations = relations(characters, ({ one, many }) => ({
  user: one(users, {
    fields: [characters.userId],
    references: [users.id],
  }),
  images: many(characterImages),
  documents: many(agentDocuments),
  documentChunks: many(agentDocumentChunks),
}));

export const characterImagesRelations = relations(characterImages, ({ one }) => ({
  character: one(characters, {
    fields: [characterImages.characterId],
    references: [characters.id],
  }),
}));

export const agentDocumentsRelations = relations(agentDocuments, ({ one, many }) => ({
  user: one(users, {
    fields: [agentDocuments.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [agentDocuments.characterId],
    references: [characters.id],
  }),
  chunks: many(agentDocumentChunks),
}));

export const agentDocumentChunksRelations = relations(agentDocumentChunks, ({ one }) => ({
  document: one(agentDocuments, {
    fields: [agentDocumentChunks.documentId],
    references: [agentDocuments.id],
  }),
  user: one(users, {
    fields: [agentDocumentChunks.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [agentDocumentChunks.characterId],
    references: [characters.id],
  }),
}));

export const agentSyncFoldersRelations = relations(agentSyncFolders, ({ one, many }) => ({
  user: one(users, {
    fields: [agentSyncFolders.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [agentSyncFolders.characterId],
    references: [characters.id],
  }),
  files: many(agentSyncFiles),
}));

export const agentSyncFilesRelations = relations(agentSyncFiles, ({ one }) => ({
  folder: one(agentSyncFolders, {
    fields: [agentSyncFiles.folderId],
    references: [agentSyncFolders.id],
  }),
  character: one(characters, {
    fields: [agentSyncFiles.characterId],
    references: [characters.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type CharacterImage = typeof characterImages.$inferSelect;
export type NewCharacterImage = typeof characterImages.$inferInsert;

export type AgentDocument = typeof agentDocuments.$inferSelect;
export type NewAgentDocument = typeof agentDocuments.$inferInsert;
export type AgentDocumentChunk = typeof agentDocumentChunks.$inferSelect;
export type NewAgentDocumentChunk = typeof agentDocumentChunks.$inferInsert;

export type AgentSyncFolder = typeof agentSyncFolders.$inferSelect;
export type NewAgentSyncFolder = typeof agentSyncFolders.$inferInsert;
export type AgentSyncFile = typeof agentSyncFiles.$inferSelect;
export type NewAgentSyncFile = typeof agentSyncFiles.$inferInsert;

export interface CharacterFull extends Character {
  images: CharacterImage[];
}

export type CharacterStatus = "draft" | "active" | "archived";
export type CharacterImageType = "portrait" | "full_body" | "expression" | "outfit" | "scene" | "avatar";

