import type { Tool } from "ai";
import type { Character } from "@/lib/db/schema";
import type { AgentMetadata } from "@/lib/characters/validation";
import { MCPClientManager, resolveMCPConfig } from "@/lib/mcp/client-manager";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import {
    createMCPToolWrapper,
    getMCPToolId,
    getMCPToolsForAgent,
    mcpToolToMetadata,
    type MCPToolLoadingPreference,
} from "@/lib/ai/tool-registry/mcp-tool-adapter";
import { loadSettings } from "@/lib/settings/settings-manager";

/**
 * Result structure for MCP tool loading with loading mode separation
 */
export interface MCPToolLoadResult {
    /** All enabled MCP tools (both alwaysLoad and deferred) */
    allTools: Record<string, Tool>;
    /** Tool IDs that should be in initialActiveTools (alwaysLoad: true) */
    alwaysLoadToolIds: string[];
    /** Tool IDs that are deferred (discoverable via searchTools) */
    deferredToolIds: string[];
}

/**
 * Load MCP tools for a specific character/agent with loading mode support
 * Connects to configured MCP servers and creates AI SDK tool wrappers.
 * Also syncs with current config - disconnects servers no longer in config
 * and clears their tools from the registry.
 */
export async function loadMCPToolsForCharacter(
    character?: Character
): Promise<MCPToolLoadResult> {
    const settings = loadSettings();
    const manager = MCPClientManager.getInstance();
    const registry = ToolRegistry.getInstance();
    const env = settings.mcpEnvironment || {};

    // Combine global and per-agent MCP configs
    const globalConfig = settings.mcpServers?.mcpServers || {};
    const metadata = character?.metadata as AgentMetadata | undefined;
    const agentConfig = metadata?.mcpServers?.mcpServers || {};
    const combinedConfig = { ...globalConfig, ...agentConfig };

    // Get enabled servers and tools for this agent
    const enabledServers = metadata?.enabledMcpServers;
    const enabledTools = metadata?.enabledMcpTools;

    // NEW: Get per-tool preferences
    const mcpToolPreferences = metadata?.mcpToolPreferences ?? {};

    // Build set of servers that should be connected based on current config
    const configuredServerNames = new Set<string>(Object.keys(combinedConfig));

    // CRITICAL: Sync with config - disconnect servers that are no longer configured
    // and clean up their tools from the registry
    const { disconnectedServers, deferred } = await manager.syncWithConfigSafely(configuredServerNames);
    for (const serverName of disconnectedServers) {
        // Remove tools from registry for disconnected servers
        // Tool IDs have format: mcp_{sanitizedServerName}_{toolName}
        const sanitizedName = serverName.replace(/[^a-zA-Z0-9]/g, "_");
        const prefix = `mcp_${sanitizedName}_`;
        registry.unregisterByPrefix(prefix);
    }

    // If no servers are configured, also clear any remaining MCP tools from registry
    // This handles edge cases where state got out of sync
    if (configuredServerNames.size === 0 && !deferred) {
        // Use category-based cleanup as a fallback
        registry.unregisterByCategory("mcp");
        console.log("[MCP] No MCP servers configured, cleared all MCP tools from registry");
    }

    // Connect to any servers that aren't already connected
    // Use Promise.all with individual error handling to parallelize connections
    const connectionPromises: Promise<void>[] = [];
    
    for (const [serverName, config] of Object.entries(combinedConfig)) {
        // Skip if server is not enabled for this agent AND no individual tools from it are enabled
        if (enabledServers && !enabledServers.includes(serverName)) {
            const hasEnabledTools = enabledTools?.some(t => t.startsWith(`${serverName}:`));
            if (!hasEnabledTools) {
                continue;
            }
        }

        // Check if already connected with compatible context
        const isConnected = manager.isConnected(serverName);
        const connectedContext = manager.getConnectedCharacterId(serverName);
        
        // Skip if already connected with:
        // 1. Same character context, OR
        // 2. No character context (from instrumentation) - this is compatible with any character
        if (isConnected) {
            if (connectedContext === character?.id || connectedContext === undefined) {
                console.log(`[MCP] Server ${serverName} already connected with compatible context, skipping`);
                continue;
            }
        }

        // Need to connect (or reconnect for different character)
        const connectPromise = (async () => {
            try {
                const resolved = await resolveMCPConfig(
                    serverName,
                    config as any,
                    env,
                    character?.id
                );
                await manager.connect(serverName, resolved, character?.id);
            } catch (error) {
                console.error(`[MCP] Failed to connect to ${serverName}:`, error);
            }
        })();
        
        connectionPromises.push(connectPromise);
    }
    
    // Wait for all connections to complete
    if (connectionPromises.length > 0) {
        await Promise.all(connectionPromises);
    }

    // Get filtered MCP tools for this agent
    const mcpTools = getMCPToolsForAgent(enabledServers, enabledTools);

    // Convert to AI SDK tools with loading mode awareness
    const allTools: Record<string, Tool> = {};
    const alwaysLoadToolIds: string[] = [];
    const deferredToolIds: string[] = [];

    for (const mcpTool of mcpTools) {
        const toolKey = `${mcpTool.serverName}:${mcpTool.name}`;
        const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);

        // Get per-tool preference (default: enabled with deferred loading)
        const preference = mcpToolPreferences[toolKey] ?? {
            enabled: true,
            loadingMode: "deferred" as const,
        };

        // Skip disabled tools
        if (!preference.enabled) {
            continue;
        }

        // Register with ToolRegistry using preference-aware metadata
        const metadata = mcpToolToMetadata(mcpTool, preference);
        try {
            const factory = () => createMCPToolWrapper(mcpTool);
            registry.register(toolId, metadata, factory);

            allTools[toolId] = createMCPToolWrapper(mcpTool);
        } catch (error) {
            console.warn(`[MCP] Skipping tool ${toolId} due to schema error:`, error);
            continue;
        }

        // Track by loading mode
        if (preference.loadingMode === "always") {
            alwaysLoadToolIds.push(toolId);
        } else {
            deferredToolIds.push(toolId);
        }
    }

    if (Object.keys(allTools).length > 0) {
        console.log(`[MCP] Loaded ${Object.keys(allTools).length} MCP tools (${alwaysLoadToolIds.length} always-load, ${deferredToolIds.length} deferred)`);
    }

    return { allTools, alwaysLoadToolIds, deferredToolIds };
}
