/**
 * Plugin Registry — CRUD operations for installed plugins.
 *
 * Handles installing, listing, updating, and uninstalling plugins
 * with proper DB persistence and hook/MCP lifecycle management.
 */

import { and, eq, desc, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import {
  plugins,
  pluginHooks,
  pluginMcpServers,
  pluginLspServers,
  pluginFiles,
  marketplaces,
  agentPlugins,
} from "@/lib/db/sqlite-plugins-schema";
import type { Plugin, NewPlugin, Marketplace, NewMarketplace } from "@/lib/db/sqlite-plugins-schema";
import type {
  PluginParseResult,
  PluginScope,
  PluginStatus,
  InstalledPlugin,
  PluginComponents,
  PluginManifest,
  PluginHooksConfig,
  PluginMCPConfig,
  PluginLSPConfig,
  RegisteredMarketplace,
  MarketplaceManifest,
} from "./types";
import {
  registerPluginHooks,
  unregisterPluginHooks,
  clearAllHooks,
} from "./hooks-engine";
import { seedPluginSkillRevisions } from "./skill-revision-queries";

// =============================================================================
// Plugin Installation
// =============================================================================

export interface InstallPluginInput {
  userId: string;
  characterId?: string;
  parsed: PluginParseResult;
  scope?: PluginScope;
  marketplaceName?: string;
  cachePath?: string;
}

/**
 * Install a plugin from a parsed plugin package.
 * Inserts the plugin record, hooks, MCP servers, LSP servers, and files.
 * Also registers hooks in the in-memory hook engine.
 */
export async function installPlugin(input: InstallPluginInput): Promise<InstalledPlugin> {
  const {
    userId,
    characterId,
    parsed,
    scope = "user",
    marketplaceName,
    cachePath,
  } = input;

  const manifest = parsed.manifest;
  const components = parsed.components;

  // Insert plugin record
  const [pluginRow] = await db
    .insert(plugins)
    .values({
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      scope,
      status: "active",
      marketplaceName: marketplaceName || null,
      manifest: manifest as unknown as Record<string, unknown>,
      components: components as unknown as Record<string, unknown>,
      userId,
      characterId: characterId || null,
      cachePath: cachePath || null,
    })
    .returning();

  // Insert hooks into DB
  if (components.hooks?.hooks) {
    const hookRows: Array<{
      pluginId: string;
      event: string;
      matcher: string | null;
      handlerType: "command" | "prompt" | "agent";
      command: string | null;
      timeout: number;
      statusMessage: string | null;
    }> = [];

    for (const [event, entries] of Object.entries(components.hooks.hooks)) {
      if (!entries) continue;
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          hookRows.push({
            pluginId: pluginRow.id,
            event,
            matcher: entry.matcher || null,
            handlerType: handler.type,
            command: handler.command || null,
            timeout: handler.timeout || 600,
            statusMessage: handler.statusMessage || null,
          });
        }
      }
    }

    if (hookRows.length > 0) {
      await db.insert(pluginHooks).values(hookRows);
    }

    // Register hooks in-memory
    registerPluginHooks(manifest.name, components.hooks);
  }

  // Insert MCP server configs
  if (components.mcpServers) {
    const mcpRows = Object.entries(components.mcpServers).map(([serverName, config]) => ({
      pluginId: pluginRow.id,
      serverName,
      config: config as unknown as Record<string, unknown>,
    }));

    if (mcpRows.length > 0) {
      await db.insert(pluginMcpServers).values(mcpRows);
    }
  }

  // Insert LSP server configs
  if (components.lspServers) {
    const lspRows = Object.entries(components.lspServers).map(([serverName, config]) => ({
      pluginId: pluginRow.id,
      serverName,
      config: config as unknown as Record<string, unknown>,
    }));

    if (lspRows.length > 0) {
      await db.insert(pluginLspServers).values(lspRows);
    }
  }

  // Insert plugin files (metadata only, not content — files stay on disk in cache)
  if (parsed.files.length > 0) {
    await db.insert(pluginFiles).values(
      parsed.files.map((file) => ({
        pluginId: pluginRow.id,
        relativePath: file.relativePath,
        mimeType: file.mimeType,
        size: file.size,
        isExecutable: file.isExecutable,
      }))
    );
  }

  // Seed revision history so plugin skills become patch-editable.
  if (components.skills.length > 0) {
    await seedPluginSkillRevisions(pluginRow.id, components.skills);
  }

  return mapInstalledPlugin(pluginRow);
}

// =============================================================================
// Plugin Queries
// =============================================================================

/**
 * Get all installed plugins for a user, optionally filtered by scope or character.
 */
export async function getInstalledPlugins(
  userId: string,
  options?: { scope?: PluginScope; characterId?: string; status?: PluginStatus }
): Promise<InstalledPlugin[]> {
  const conditions = [eq(plugins.userId, userId)];

  if (options?.scope) {
    conditions.push(eq(plugins.scope, options.scope));
  }
  if (options?.characterId) {
    conditions.push(eq(plugins.characterId, options.characterId));
  }
  if (options?.status) {
    conditions.push(eq(plugins.status, options.status));
  }

  const rows = await db
    .select()
    .from(plugins)
    .where(and(...conditions))
    .orderBy(desc(plugins.installedAt));

  return rows.map(mapInstalledPlugin);
}

/**
 * Get a single installed plugin by ID.
 */
export async function getPluginById(pluginId: string): Promise<InstalledPlugin | null> {
  const [row] = await db.select().from(plugins).where(eq(plugins.id, pluginId));
  return row ? mapInstalledPlugin(row) : null;
}

/**
 * Get a plugin by name and marketplace for a user.
 */
export async function getPluginByName(
  userId: string,
  name: string,
  marketplaceName?: string
): Promise<InstalledPlugin | null> {
  const conditions = [eq(plugins.userId, userId), eq(plugins.name, name)];
  if (marketplaceName) {
    conditions.push(eq(plugins.marketplaceName, marketplaceName));
  }

  const [row] = await db
    .select()
    .from(plugins)
    .where(and(...conditions));

  return row ? mapInstalledPlugin(row) : null;
}

// =============================================================================
// Plugin Update / Uninstall
// =============================================================================

/**
 * Update a plugin's status.
 */
export async function updatePluginStatus(
  pluginId: string,
  status: PluginStatus,
  lastError?: string
): Promise<void> {
  await db
    .update(plugins)
    .set({
      status,
      lastError: lastError || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(plugins.id, pluginId));

  // If disabling, unregister hooks
  if (status === "disabled" || status === "error") {
    const plugin = await getPluginById(pluginId);
    if (plugin) {
      unregisterPluginHooks(plugin.name);
    }
  }
}

/**
 * Uninstall a plugin — removes DB records and unregisters hooks.
 * CASCADE handles hook/mcp/lsp/file deletion.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  const plugin = await getPluginById(pluginId);
  if (plugin) {
    unregisterPluginHooks(plugin.name);
  }

  await db.delete(plugins).where(eq(plugins.id, pluginId));
}

// =============================================================================
// Marketplace CRUD
// =============================================================================

export async function addMarketplace(input: {
  userId: string;
  name: string;
  source: string;
  catalog?: MarketplaceManifest;
}): Promise<RegisteredMarketplace> {
  const [row] = await db
    .insert(marketplaces)
    .values({
      name: input.name,
      source: input.source,
      catalog: input.catalog ? (input.catalog as unknown as Record<string, unknown>) : null,
      userId: input.userId,
      lastFetchedAt: input.catalog ? new Date().toISOString() : null,
    })
    .returning();

  return mapMarketplace(row);
}

export async function getMarketplaces(userId: string): Promise<RegisteredMarketplace[]> {
  const rows = await db
    .select()
    .from(marketplaces)
    .where(eq(marketplaces.userId, userId))
    .orderBy(desc(marketplaces.createdAt));

  return rows.map(mapMarketplace);
}

export async function removeMarketplace(marketplaceId: string): Promise<void> {
  await db.delete(marketplaces).where(eq(marketplaces.id, marketplaceId));
}

export async function updateMarketplaceCatalog(
  marketplaceId: string,
  catalog: MarketplaceManifest
): Promise<void> {
  await db
    .update(marketplaces)
    .set({
      catalog: catalog as unknown as Record<string, unknown>,
      lastFetchedAt: new Date().toISOString(),
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(marketplaces.id, marketplaceId));
}

// =============================================================================
// Per-Agent Plugin Assignment
// =============================================================================

export interface AgentPluginAssignment {
  plugin: InstalledPlugin;
  enabledForAgent: boolean;
}

/**
 * Get all available plugins for assignment to an agent.
 * Includes global plugins and character-scoped plugins for this character.
 */
export async function getAvailablePluginsForAgent(
  userId: string,
  agentId: string,
  characterId?: string
): Promise<AgentPluginAssignment[]> {
  const rows = await db
    .select({
      id: plugins.id,
      name: plugins.name,
      description: plugins.description,
      version: plugins.version,
      scope: plugins.scope,
      status: plugins.status,
      marketplaceName: plugins.marketplaceName,
      manifest: plugins.manifest,
      components: plugins.components,
      installedAt: plugins.installedAt,
      updatedAt: plugins.updatedAt,
      lastError: plugins.lastError,
      characterId: plugins.characterId,
      assignmentEnabled: agentPlugins.enabled,
    })
    .from(plugins)
    .leftJoin(
      agentPlugins,
      and(eq(agentPlugins.pluginId, plugins.id), eq(agentPlugins.agentId, agentId))
    )
    .where(
      and(
        eq(plugins.userId, userId),
        eq(plugins.status, "active"),
        characterId
          ? or(isNull(plugins.characterId), eq(plugins.characterId, characterId))
          : isNull(plugins.characterId)
      )
    )
    .orderBy(desc(plugins.installedAt));

  return rows.map((row) => ({
    plugin: mapInstalledPlugin({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      scope: row.scope,
      status: row.status,
      marketplaceName: row.marketplaceName,
      manifest: row.manifest,
      components: row.components,
      userId,
      characterId: row.characterId,
      cachePath: null,
      lastError: row.lastError,
      installedAt: row.installedAt,
      updatedAt: row.updatedAt,
    }),
    enabledForAgent: row.assignmentEnabled ?? true,
  }));
}

/**
 * Get plugins that are effectively enabled for a specific agent.
 */
export async function getEnabledPluginsForAgent(
  userId: string,
  agentId: string,
  characterId?: string
): Promise<InstalledPlugin[]> {
  const available = await getAvailablePluginsForAgent(userId, agentId, characterId);
  return available
    .filter((entry) => entry.enabledForAgent)
    .map((entry) => entry.plugin);
}

/**
 * Enable a plugin for an agent (upsert).
 */
export async function enablePluginForAgent(agentId: string, pluginId: string): Promise<void> {
  const existing = await db
    .select({ id: agentPlugins.id })
    .from(agentPlugins)
    .where(and(eq(agentPlugins.agentId, agentId), eq(agentPlugins.pluginId, pluginId)));

  if (existing.length > 0) {
    await db
      .update(agentPlugins)
      .set({ enabled: true })
      .where(and(eq(agentPlugins.agentId, agentId), eq(agentPlugins.pluginId, pluginId)));
    return;
  }

  await db.insert(agentPlugins).values({ agentId, pluginId, enabled: true });
}

/**
 * Disable a plugin for an agent (upsert).
 */
export async function disablePluginForAgent(agentId: string, pluginId: string): Promise<void> {
  const existing = await db
    .select({ id: agentPlugins.id })
    .from(agentPlugins)
    .where(and(eq(agentPlugins.agentId, agentId), eq(agentPlugins.pluginId, pluginId)));

  if (existing.length > 0) {
    await db
      .update(agentPlugins)
      .set({ enabled: false })
      .where(and(eq(agentPlugins.agentId, agentId), eq(agentPlugins.pluginId, pluginId)));
    return;
  }

  await db.insert(agentPlugins).values({ agentId, pluginId, enabled: false });
}

/**
 * Toggle a plugin assignment for an agent.
 */
export async function setPluginEnabledForAgent(
  agentId: string,
  pluginId: string,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    await enablePluginForAgent(agentId, pluginId);
    return;
  }
  await disablePluginForAgent(agentId, pluginId);
}

// =============================================================================
// Load Active Plugin Hooks
// =============================================================================

/**
 * Load and register hooks for a specific plugin list.
 * Clears the in-memory hook registry first so agent-specific sets do not leak.
 */
export function loadPluginHooks(pluginsToLoad: InstalledPlugin[]): number {
  clearAllHooks();

  let hookCount = 0;
  for (const plugin of pluginsToLoad) {
    if (!plugin.components.hooks) continue;
    registerPluginHooks(plugin.name, plugin.components.hooks);
    hookCount++;
  }

  return hookCount;
}

/**
 * Load and register hooks from all active plugins for a user.
 */
export async function loadActivePluginHooks(userId: string): Promise<number> {
  const activePlugins = await getInstalledPlugins(userId, { status: "active" });
  return loadPluginHooks(activePlugins);
}

// =============================================================================
// Mappers
// =============================================================================

function mapInstalledPlugin(row: Plugin): InstalledPlugin {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    scope: row.scope as PluginScope,
    status: row.status as PluginStatus,
    marketplaceName: row.marketplaceName || undefined,
    manifest: row.manifest as unknown as PluginManifest,
    components: row.components as unknown as PluginComponents,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    lastError: row.lastError || undefined,
  };
}

function mapMarketplace(row: Marketplace): RegisteredMarketplace {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    catalog: row.catalog as unknown as MarketplaceManifest | null,
    autoUpdate: row.autoUpdate,
    lastFetchedAt: row.lastFetchedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}
