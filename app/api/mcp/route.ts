/**
 * MCP Configuration API Route
 * 
 * Handles MCP server configuration management.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import { MCPClientManager } from "@/lib/mcp/client-manager";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import type { MCPConfig } from "@/lib/mcp/types";

/**
 * GET /api/mcp
 * Get MCP server configurations and status
 */
export async function GET() {
    try {
        const settings = loadSettings();
        const manager = MCPClientManager.getInstance();

        return NextResponse.json({
            config: settings.mcpServers || { mcpServers: {} },
            environment: maskEnvironment(settings.mcpEnvironment || {}),
            status: manager.getAllStatus(),
        });
    } catch (error) {
        console.error("[MCP API] Error:", error);
        return NextResponse.json({ error: "Failed to get MCP config" }, { status: 500 });
    }
}

/**
 * PUT /api/mcp
 * Update MCP server configuration
 * Also syncs MCP connections - disconnects servers no longer in config
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { mcpServers, mcpEnvironment } = body as {
            mcpServers?: MCPConfig;
            mcpEnvironment?: Record<string, string>;
        };

        const settings = loadSettings();

        if (mcpServers !== undefined) {
            settings.mcpServers = mcpServers;
        }

        if (mcpEnvironment !== undefined) {
            // Merge with existing, only update non-masked values
            settings.mcpEnvironment = {
                ...settings.mcpEnvironment,
                ...Object.fromEntries(
                    Object.entries(mcpEnvironment).filter(([_, v]) => !v.includes("•"))
                ),
            };
        }

        saveSettings(settings);

        // CRITICAL: Sync MCP connections with the new config
        // This disconnects servers that were removed and clears their tools
        const manager = MCPClientManager.getInstance();
        const registry = ToolRegistry.getInstance();
        const mcpConfig = mcpServers?.mcpServers || settings.mcpServers?.mcpServers || {};
        const configuredServers = new Set<string>(
            Object.entries(mcpConfig)
                .filter(([_, config]) => config.enabled !== false)
                .map(([name]) => name)
        );

        const disconnectedServers = await manager.syncWithConfig(configuredServers);

        // Clean up tools from registry for disconnected servers
        for (const serverName of disconnectedServers) {
            const sanitizedName = serverName.replace(/[^a-zA-Z0-9]/g, "_");
            const prefix = `mcp_${sanitizedName}_`;
            registry.unregisterByPrefix(prefix);
        }

        // If no servers configured, clear all MCP tools as a safety measure
        if (configuredServers.size === 0) {
            registry.unregisterByCategory("mcp");
            console.log("[MCP API] No servers configured, cleared all MCP tools");
        }

        return NextResponse.json({
            success: true,
            disconnectedServers: disconnectedServers.length,
        });
    } catch (error) {
        console.error("[MCP API] Error:", error);
        return NextResponse.json({ error: "Failed to save MCP config" }, { status: 500 });
    }
}

/**
 * Mask sensitive environment variable values for display
 */
function maskEnvironment(env: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (value.length > 8) {
            masked[key] = value.slice(0, 4) + "••••••••" + value.slice(-4);
        } else {
            masked[key] = "••••••••";
        }
    }
    return masked;
}

