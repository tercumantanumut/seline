/**
 * MCP Connect API Route
 *
 * Handles connecting to MCP servers and discovering tools.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSettings } from "@/lib/settings/settings-manager";
import { MCPClientManager, resolveMCPConfig } from "@/lib/mcp/client-manager";
import { clearMCPAuthCache, clearMCPAuthCacheForServer } from "@/lib/mcp/auth-cache";

/**
 * POST /api/mcp/connect
 * Connect to MCP servers and discover tools
 *
 * Body options:
 * - serverNames: string[] - specific servers to connect (default: all configured)
 * - forceReauth: boolean - clear OAuth cache before connecting to force re-authentication
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { serverNames, forceReauth } = body as {
            serverNames?: string[];
            forceReauth?: boolean;
        };

        const settings = loadSettings();
        const manager = MCPClientManager.getInstance();
        const env = settings.mcpEnvironment || {};

        const mcpConfig = settings.mcpServers?.mcpServers || {};
        const serversToConnect = serverNames || Object.keys(mcpConfig);

        // If forceReauth is true, clear the OAuth cache for the specified servers
        // This forces mcp-remote to re-authenticate with the OAuth provider
        if (forceReauth) {
            if (serverNames && serverNames.length > 0) {
                // Clear cache for specific servers
                for (const serverName of serverNames) {
                    const config = mcpConfig[serverName];
                    if (config) {
                        // Extract the URL from config to generate the cache key
                        const url = (config as { url?: string }).url;
                        if (url) {
                            await clearMCPAuthCacheForServer(url);
                        }
                    }
                }
            } else {
                // Clear all MCP auth cache
                await clearMCPAuthCache();
            }
        }

        const results: Record<string, { success: boolean; error?: string; toolCount?: number }> = {};

        for (const serverName of serversToConnect) {
            const config = mcpConfig[serverName];
            if (!config) {
                results[serverName] = { success: false, error: "Server not configured" };
                continue;
            }

            try {
                // Disconnect first if forceReauth to ensure clean state
                if (forceReauth && manager.isConnected(serverName)) {
                    await manager.disconnect(serverName);
                }

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
