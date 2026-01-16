/**
 * MCP Chat Integration
 * 
 * Helper functions for loading and integrating MCP tools into the chat route.
 */

import type { Tool } from "ai";
import type { Character } from "@/lib/db/schema";
import { MCPClientManager, resolveMCPConfig } from "@/lib/mcp/client-manager";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import {
    createMCPToolWrapper,
    getMCPToolId,
    getMCPToolsForAgent,
    mcpToolToMetadata,
} from "@/lib/ai/tool-registry/mcp-tool-adapter";
import { loadSettings } from "@/lib/settings/settings-manager";

/**
 * Load MCP tools for a specific character/agent
 * Connects to configured MCP servers and creates AI SDK tool wrappers.
 * Also syncs with current config - disconnects servers no longer in config
 * and clears their tools from the registry.
 */
export async function loadMCPToolsForCharacter(
    character?: Character
): Promise<Record<string, Tool>> {
    const settings = loadSettings();
    const manager = MCPClientManager.getInstance();
    const registry = ToolRegistry.getInstance();
    const env = settings.mcpEnvironment || {};

    // Combine global and per-agent MCP configs
    const globalConfig = settings.mcpServers?.mcpServers || {};
    const agentConfig = (character?.metadata as { mcpServers?: { mcpServers: Record<string, unknown> } })?.mcpServers?.mcpServers || {};
    const combinedConfig = { ...globalConfig, ...agentConfig };

    // Get enabled servers for this agent
    const enabledServers = (character?.metadata as { enabledMcpServers?: string[] })?.enabledMcpServers;
    const enabledTools = (character?.metadata as { enabledMcpTools?: string[] })?.enabledMcpTools;

    // Build set of servers that should be connected based on current config
    const configuredServerNames = new Set<string>(Object.keys(combinedConfig));

    // CRITICAL: Sync with config - disconnect servers that are no longer configured
    // and clean up their tools from the registry
    const disconnectedServers = await manager.syncWithConfig(configuredServerNames);
    for (const serverName of disconnectedServers) {
        // Remove tools from registry for disconnected servers
        // Tool IDs have format: mcp_{sanitizedServerName}_{toolName}
        const sanitizedName = serverName.replace(/[^a-zA-Z0-9]/g, "_");
        const prefix = `mcp_${sanitizedName}_`;
        registry.unregisterByPrefix(prefix);
    }

    // If no servers are configured, also clear any remaining MCP tools from registry
    // This handles edge cases where state got out of sync
    if (configuredServerNames.size === 0) {
        // Use category-based cleanup as a fallback
        registry.unregisterByCategory("mcp");
        console.log("[MCP] No MCP servers configured, cleared all MCP tools from registry");
    }

    // Connect to any servers that aren't already connected
    for (const [serverName, config] of Object.entries(combinedConfig)) {
        // Skip if server is not enabled for this agent
        if (enabledServers && !enabledServers.includes(serverName)) {
            continue;
        }

        if (!manager.isConnected(serverName)) {
            try {
                const resolved = resolveMCPConfig(
                    serverName,
                    config as { type: "http" | "sse"; url: string; headers?: Record<string, string>; timeout?: number },
                    env
                );
                await manager.connect(serverName, resolved);
            } catch (error) {
                console.error(`[MCP] Failed to connect to ${serverName}:`, error);
            }
        }
    }

    // Get filtered MCP tools for this agent
    const mcpTools = getMCPToolsForAgent(enabledServers, enabledTools);

    // Convert to AI SDK tools and register them
    const tools: Record<string, Tool> = {};
    for (const mcpTool of mcpTools) {
        const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);

        // Register with ToolRegistry for discovery (searchTools)
        const metadata = mcpToolToMetadata(mcpTool);
        // Factory that returns the wrapper
        const factory = () => createMCPToolWrapper(mcpTool);
        registry.register(toolId, metadata, factory);

        tools[toolId] = createMCPToolWrapper(mcpTool);
    }

    if (Object.keys(tools).length > 0) {
        console.log(`[MCP] Loaded ${Object.keys(tools).length} MCP tools for character ${character?.name || "default"}`);
    } else if (configuredServerNames.size === 0) {
        console.log("[MCP] No MCP servers configured, no tools loaded");
    }

    return tools;
}
