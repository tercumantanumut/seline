/**
 * MCP Tool Adapter
 * 
 * Converts MCP tools to Seline's ToolMetadata format and creates AI SDK-compatible wrappers.
 */

import { tool, jsonSchema } from "ai";
import type { Tool } from "ai";
import type { ToolMetadata, ToolFactory } from "@/lib/ai/tool-registry/types";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import { MCPClientManager, type MCPDiscoveredTool } from "@/lib/mcp/client-manager";
import { formatMCPToolResult } from "@/lib/mcp/result-formatter";

/**
 * Category for MCP tools - they get their own category
 */
export const MCP_TOOL_CATEGORY = "mcp" as const;

/**
 * Per-tool loading preference from agent settings
 */
export interface MCPToolLoadingPreference {
    enabled: boolean;
    loadingMode: "always" | "deferred";
}

/**
 * Convert an MCP tool to Seline's ToolMetadata format
 * @param mcpTool - The MCP tool from the server
 * @param preference - Optional per-tool loading preference from agent settings
 */
export function mcpToolToMetadata(
    mcpTool: MCPDiscoveredTool,
    preference?: MCPToolLoadingPreference
): ToolMetadata {
    // Determine loading configuration based on preference
    const loadingConfig = preference?.loadingMode === "always"
        ? { alwaysLoad: true, deferLoading: false }
        : { alwaysLoad: false, deferLoading: true };  // Default to deferred

    return {
        displayName: `${mcpTool.name} (${mcpTool.serverName})`,
        category: MCP_TOOL_CATEGORY,
        keywords: [
            mcpTool.name,
            mcpTool.serverName,
            "mcp",
            "external",
            ...(mcpTool.description?.toLowerCase().split(/\s+/).slice(0, 5) || []),
        ],
        shortDescription: mcpTool.description || `MCP tool from ${mcpTool.serverName}`,
        fullInstructions: mcpTool.description,
        loading: loadingConfig,  // Now dynamic based on preference
        requiresSession: false,
    };
}

/**
 * Create an AI SDK tool wrapper for an MCP tool
 */
export function createMCPToolWrapper(mcpTool: MCPDiscoveredTool): Tool {
    const manager = MCPClientManager.getInstance();

    // Convert MCP input schema to AI SDK jsonSchema format
    const schema = jsonSchema<Record<string, unknown>>(mcpTool.inputSchema as any);

    return tool({
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        inputSchema: schema,
        execute: async (args: Record<string, unknown>) => {
            try {
                const result = await manager.executeTool(
                    mcpTool.serverName,
                    mcpTool.name,
                    args
                );

                // Format result according to Seline's conventions (strip base64 payloads)
                return await formatMCPToolResult(
                    mcpTool.serverName,
                    mcpTool.name,
                    result,
                    false
                );
            } catch (error) {
                console.error(`[MCP Tool] Error executing ${mcpTool.serverName}:${mcpTool.name}:`, error);
                return await formatMCPToolResult(
                    mcpTool.serverName,
                    mcpTool.name,
                    error instanceof Error ? error.message : String(error),
                    true
                );
            }
        },
    });
}

/**
 * Generate a unique tool ID for an MCP tool
 * Format: mcp_{serverName}_{toolName}
 */
export function getMCPToolId(serverName: string, toolName: string): string {
    // Sanitize names for use as identifiers
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");
    return `mcp_${sanitize(serverName)}_${sanitize(toolName)}`;
}

/**
 * Register all tools from connected MCP servers with the ToolRegistry
 */
export function registerMCPTools(): void {
    const manager = MCPClientManager.getInstance();
    const registry = ToolRegistry.getInstance();

    const allTools = manager.getAllTools();

    for (const mcpTool of allTools) {
        const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
        const metadata = mcpToolToMetadata(mcpTool);
        const factory: ToolFactory = () => createMCPToolWrapper(mcpTool);

        registry.register(toolId, metadata, factory);
        console.log(`[MCP] Registered tool: ${toolId}`);
    }

    console.log(`[MCP] Registered ${allTools.length} MCP tools`);
}

/**
 * Get MCP tools filtered by enabled servers/tools for an agent
 */
export function getMCPToolsForAgent(
    enabledServers?: string[],
    enabledTools?: string[]
): MCPDiscoveredTool[] {
    const manager = MCPClientManager.getInstance();
    let tools = manager.getAllTools();

    // Filter by enabled servers
    if (enabledServers && enabledServers.length > 0) {
        const serverSet = new Set(enabledServers);
        tools = tools.filter(t => serverSet.has(t.serverName));
    }

    // Filter by enabled tools (format: "serverName:toolName")
    if (enabledTools && enabledTools.length > 0) {
        const toolSet = new Set(enabledTools);
        tools = tools.filter(t => toolSet.has(`${t.serverName}:${t.name}`));
    }

    return tools;
}
