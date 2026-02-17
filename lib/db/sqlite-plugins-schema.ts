import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./sqlite-schema";
import { characters } from "./sqlite-character-schema";

// =============================================================================
// Plugins Table — Installed plugin records
// =============================================================================

export const plugins = sqliteTable(
  "plugins",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Plugin name from manifest (kebab-case). */
    name: text("name").notNull(),
    /** Plugin description. */
    description: text("description").notNull(),
    /** Semantic version string. */
    version: text("version").notNull(),
    /** Installation scope: user, project, local, managed. */
    scope: text("scope", { enum: ["user", "project", "local", "managed"] }).default("user").notNull(),
    /** Current status. */
    status: text("status", { enum: ["active", "disabled", "error"] }).default("active").notNull(),
    /** Source marketplace name (if installed from marketplace). */
    marketplaceName: text("marketplace_name"),
    /** The full plugin.json manifest as JSON. */
    manifest: text("manifest", { mode: "json" }).notNull(),
    /** All discovered components as JSON. */
    components: text("components", { mode: "json" }).notNull(),
    /** User who installed this plugin. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    /** Optional: agent this plugin is scoped to. */
    characterId: text("character_id").references(() => characters.id, { onDelete: "cascade" }),
    /** Path to cached plugin files on disk. */
    cachePath: text("cache_path"),
    /** Last error message (if status is "error"). */
    lastError: text("last_error"),
    installedAt: text("installed_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userScopeIdx: index("idx_plugins_user_scope").on(table.userId, table.scope, table.status),
    nameMarketplaceIdx: uniqueIndex("idx_plugins_name_marketplace_user").on(table.name, table.marketplaceName, table.userId),
    characterIdx: index("idx_plugins_character").on(table.characterId),
  })
);

// =============================================================================
// Plugin Hooks Table — Hook registrations from plugins
// =============================================================================

export const pluginHooks = sqliteTable(
  "plugin_hooks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
    /** Hook event type (e.g., PreToolUse, PostToolUse). */
    event: text("event").notNull(),
    /** Regex matcher for tool names (optional). */
    matcher: text("matcher"),
    /** Handler type: command, prompt, agent. */
    handlerType: text("handler_type", { enum: ["command", "prompt", "agent"] }).notNull(),
    /** Shell command to execute. */
    command: text("command"),
    /** Timeout in seconds. */
    timeout: integer("timeout").default(600),
    /** Status message shown while hook runs. */
    statusMessage: text("status_message"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    pluginEventIdx: index("idx_plugin_hooks_plugin_event").on(table.pluginId, table.event),
  })
);

// =============================================================================
// Plugin MCP Servers Table — MCP server configs from plugins
// =============================================================================

export const pluginMcpServers = sqliteTable(
  "plugin_mcp_servers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
    /** Server name within the plugin namespace. */
    serverName: text("server_name").notNull(),
    /** Full MCP server config as JSON. */
    config: text("config", { mode: "json" }).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    pluginServerIdx: uniqueIndex("idx_plugin_mcp_servers_plugin_server").on(table.pluginId, table.serverName),
  })
);

// =============================================================================
// Plugin LSP Servers Table — LSP server configs from plugins
// =============================================================================

export const pluginLspServers = sqliteTable(
  "plugin_lsp_servers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
    /** Server name (language identifier). */
    serverName: text("server_name").notNull(),
    /** Full LSP server config as JSON. */
    config: text("config", { mode: "json" }).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    pluginServerIdx: uniqueIndex("idx_plugin_lsp_servers_plugin_server").on(table.pluginId, table.serverName),
  })
);

// =============================================================================
// Plugin Files Table — Raw files from imported plugins
// =============================================================================

export const pluginFiles = sqliteTable(
  "plugin_files",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
    relativePath: text("relative_path").notNull(),
    mimeType: text("mime_type"),
    size: integer("size").notNull(),
    isExecutable: integer("is_executable", { mode: "boolean" }).default(false).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    pluginPathIdx: index("idx_plugin_files_plugin_path").on(table.pluginId, table.relativePath),
  })
);

// =============================================================================
// Agent Plugins Junction Table — Per-agent plugin assignments
// =============================================================================

export const agentPlugins = sqliteTable(
  "agent_plugins",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** The agent (character) this assignment belongs to. */
    agentId: text("agent_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
    /** The plugin being assigned. */
    pluginId: text("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
    /** Whether this plugin is enabled for this agent. */
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    agentPluginUnique: uniqueIndex("idx_agent_plugins_agent_plugin").on(table.agentId, table.pluginId),
    agentIdx: index("idx_agent_plugins_agent").on(table.agentId, table.enabled),
    pluginIdx: index("idx_agent_plugins_plugin").on(table.pluginId),
  })
);

// =============================================================================
// Marketplaces Table — Registered marketplace catalogs
// =============================================================================

export const marketplaces = sqliteTable(
  "marketplaces",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Marketplace name from manifest. */
    name: text("name").notNull().unique(),
    /** Source from which the marketplace was added (URL, path, GitHub). */
    source: text("source").notNull(),
    /** The full catalog manifest as JSON. */
    catalog: text("catalog", { mode: "json" }),
    /** Whether auto-update is enabled. */
    autoUpdate: integer("auto_update", { mode: "boolean" }).default(true).notNull(),
    /** Last time the catalog was fetched. */
    lastFetchedAt: text("last_fetched_at"),
    /** Last error during fetch. */
    lastError: text("last_error"),
    /** User who registered this marketplace. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userIdx: index("idx_marketplaces_user").on(table.userId),
  })
);

// =============================================================================
// Relations
// =============================================================================

export const pluginsRelations = relations(plugins, ({ one, many }) => ({
  user: one(users, {
    fields: [plugins.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [plugins.characterId],
    references: [characters.id],
  }),
  hooks: many(pluginHooks),
  mcpServers: many(pluginMcpServers),
  lspServers: many(pluginLspServers),
  files: many(pluginFiles),
  agentAssignments: many(agentPlugins),
}));

export const agentPluginsRelations = relations(agentPlugins, ({ one }) => ({
  agent: one(characters, {
    fields: [agentPlugins.agentId],
    references: [characters.id],
  }),
  plugin: one(plugins, {
    fields: [agentPlugins.pluginId],
    references: [plugins.id],
  }),
}));

export const pluginHooksRelations = relations(pluginHooks, ({ one }) => ({
  plugin: one(plugins, {
    fields: [pluginHooks.pluginId],
    references: [plugins.id],
  }),
}));

export const pluginMcpServersRelations = relations(pluginMcpServers, ({ one }) => ({
  plugin: one(plugins, {
    fields: [pluginMcpServers.pluginId],
    references: [plugins.id],
  }),
}));

export const pluginLspServersRelations = relations(pluginLspServers, ({ one }) => ({
  plugin: one(plugins, {
    fields: [pluginLspServers.pluginId],
    references: [plugins.id],
  }),
}));

export const pluginFilesRelations = relations(pluginFiles, ({ one }) => ({
  plugin: one(plugins, {
    fields: [pluginFiles.pluginId],
    references: [plugins.id],
  }),
}));

export const marketplacesRelations = relations(marketplaces, ({ one }) => ({
  user: one(users, {
    fields: [marketplaces.userId],
    references: [users.id],
  }),
}));

// =============================================================================
// Types
// =============================================================================

export type Plugin = typeof plugins.$inferSelect;
export type NewPlugin = typeof plugins.$inferInsert;
export type PluginHook = typeof pluginHooks.$inferSelect;
export type NewPluginHook = typeof pluginHooks.$inferInsert;
export type PluginMcpServer = typeof pluginMcpServers.$inferSelect;
export type NewPluginMcpServer = typeof pluginMcpServers.$inferInsert;
export type PluginLspServer = typeof pluginLspServers.$inferSelect;
export type NewPluginLspServer = typeof pluginLspServers.$inferInsert;
export type PluginFile = typeof pluginFiles.$inferSelect;
export type NewPluginFile = typeof pluginFiles.$inferInsert;
export type Marketplace = typeof marketplaces.$inferSelect;
export type NewMarketplace = typeof marketplaces.$inferInsert;
export type AgentPlugin = typeof agentPlugins.$inferSelect;
export type NewAgentPlugin = typeof agentPlugins.$inferInsert;
