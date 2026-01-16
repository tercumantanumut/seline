/**
 * MCP Auth API Route
 * 
 * Handles MCP authentication cache management.
 * Used to clear OAuth credentials cached by mcp-remote to force re-authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { clearMCPAuthCache, clearMCPAuthCacheForServer, hasMCPAuthCache } from "@/lib/mcp/auth-cache";

/**
 * GET /api/mcp/auth
 * Check if auth cache exists for a server
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const serverUrl = searchParams.get("serverUrl");

        if (serverUrl) {
            const hasCache = await hasMCPAuthCache(serverUrl);
            return NextResponse.json({ hasCache, serverUrl });
        }

        return NextResponse.json({ error: "serverUrl parameter required" }, { status: 400 });
    } catch (error) {
        console.error("[MCP Auth API] Error:", error);
        return NextResponse.json({ error: "Failed to check auth cache" }, { status: 500 });
    }
}

/**
 * DELETE /api/mcp/auth
 * Clear MCP auth cache to force re-authentication
 * 
 * Query params:
 * - serverUrl: string (optional) - clear cache for specific server only
 * - all: boolean - if true, clear all MCP auth cache
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const serverUrl = searchParams.get("serverUrl");
        const clearAll = searchParams.get("all") === "true";

        if (clearAll) {
            // Clear all MCP auth cache
            const result = await clearMCPAuthCache();
            return NextResponse.json({
                success: result.success,
                message: result.success 
                    ? "All MCP auth cache cleared. Servers will re-authenticate on next connect."
                    : `Failed to clear cache: ${result.error}`,
                error: result.error,
            });
        }

        if (serverUrl) {
            // Clear cache for specific server
            const result = await clearMCPAuthCacheForServer(serverUrl);
            return NextResponse.json({
                success: result.success,
                message: result.success
                    ? `Cleared ${result.filesDeleted} cache files for server. Will re-authenticate on next connect.`
                    : `Failed to clear cache: ${result.error}`,
                filesDeleted: result.filesDeleted,
                error: result.error,
            });
        }

        return NextResponse.json(
            { error: "Either 'serverUrl' or 'all=true' parameter required" },
            { status: 400 }
        );
    } catch (error) {
        console.error("[MCP Auth API] Error:", error);
        return NextResponse.json({ error: "Failed to clear auth cache" }, { status: 500 });
    }
}

