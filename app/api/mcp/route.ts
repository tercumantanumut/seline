/**
 * MCP Configuration API Route
 * 
 * Handles MCP server configuration management.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import { MCPClientManager } from "@/lib/mcp/client-manager";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import type { MCPConfig, MCPServerConfig } from "@/lib/mcp/types";

/**
 * GET /api/mcp
 * Get MCP server configurations and status
 */
export async function GET() {
    try {
        const settings = loadSettings();
        const manager = MCPClientManager.getInstance();
        
        // Mask headers in server configs
        const mcpServers = settings.mcpServers?.mcpServers || {};
        const maskedServers: Record<string, MCPServerConfig> = {};
        
        for (const [name, config] of Object.entries(mcpServers)) {
            maskedServers[name] = {
                ...config,
                headers: config.headers ? maskHeaders(config.headers) : undefined,
            };
        }

        return NextResponse.json({
            config: { mcpServers: maskedServers },
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
            // Merge headers, skipping masked values (containing •)
            const existingServers = settings.mcpServers?.mcpServers || {};
            const updatedServers: Record<string, MCPServerConfig> = {};
            
            for (const [name, config] of Object.entries(mcpServers.mcpServers || {})) {
                const existingConfig = existingServers[name];
                const mergedHeaders: Record<string, string> = {};
                
                // Merge headers, preserving existing values if new ones are masked
                if (config.headers || existingConfig?.headers) {
                    const existing = existingConfig?.headers || {};
                    const incoming = config.headers || {};
                    
                    // Start with existing headers
                    Object.assign(mergedHeaders, existing);
                    
                    // Update with incoming headers, but skip masked values
                    for (const [key, value] of Object.entries(incoming)) {
                        if (!value.includes("•")) {
                            mergedHeaders[key] = value;
                        }
                    }
                }
                
                updatedServers[name] = {
                    ...config,
                    headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
                };
            }
            
            settings.mcpServers = { mcpServers: updatedServers };
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

        const { disconnectedServers, deferred } = await manager.syncWithConfigSafely(configuredServers);

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
            deferred,
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

/**
 * Mask sensitive header values for display
 * Applies to Authorization, X-API-Key, and any header containing "token" or "key"
 */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    const sensitivePatterns = ['authorization', 'x-api-key', 'token', 'key', 'secret', 'bearer'];
    
    for (const [key, value] of Object.entries(headers)) {
        const isSensitive = sensitivePatterns.some(pattern => 
            key.toLowerCase().includes(pattern)
        );
        
        if (isSensitive && value.length > 8) {
            masked[key] = value.slice(0, 4) + "••••••••" + value.slice(-4);
        } else if (isSensitive) {
            masked[key] = "••••••••";
        } else {
            // Non-sensitive headers are shown as-is
            masked[key] = value;
        }
    }
    return masked;
}

/**
 * Check if a value is masked (contains bullet characters)
 */
function isMasked(value: string): boolean {
    return value.includes("•");
}
