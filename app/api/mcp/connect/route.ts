/**
 * MCP Connect API Route
 * 
 * Handles connecting to MCP servers and discovering tools.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSettings } from "@/lib/settings/settings-manager";
import { MCPClientManager, resolveMCPConfig } from "@/lib/mcp/client-manager";

/**
 * POST /api/mcp/connect
 * Connect to MCP servers and discover tools
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { serverNames } = body as { serverNames?: string[] };

        const settings = loadSettings();
        const manager = MCPClientManager.getInstance();
        const env = settings.mcpEnvironment || {};

        const mcpConfig = settings.mcpServers?.mcpServers || {};
        const serversToConnect = serverNames || Object.keys(mcpConfig);

        const results: Record<string, { success: boolean; error?: string; toolCount?: number }> = {};

        for (const serverName of serversToConnect) {
            const config = mcpConfig[serverName];
            if (!config) {
                results[serverName] = { success: false, error: "Server not configured" };
                continue;
            }

            try {
                const resolved = resolveMCPConfig(serverName, config, env);
                const status = await manager.connect(serverName, resolved);
                results[serverName] = {
                    success: status.connected,
                    error: status.lastError,
                    toolCount: status.toolCount,
                };
            } catch (error) {
                results[serverName] = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }

        return NextResponse.json({ results });
    } catch (error) {
        console.error("[MCP API] Connect error:", error);
        return NextResponse.json({ error: "Failed to connect to MCP servers" }, { status: 500 });
    }
}
