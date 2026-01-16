/**
 * MCP Tools API Route
 * 
 * Provides access to discovered MCP tools.
 */

import { NextRequest, NextResponse } from "next/server";
import { MCPClientManager } from "@/lib/mcp/client-manager";
import { getMCPToolId } from "@/lib/ai/tool-registry/mcp-tool-adapter";

/**
 * GET /api/mcp/tools
 * Get all discovered MCP tools
 */
export async function GET(request: NextRequest) {
    try {
        const serverName = request.nextUrl.searchParams.get("server");
        const manager = MCPClientManager.getInstance();

        const tools = serverName
            ? manager.getServerTools(serverName)
            : manager.getAllTools();

        // Format for UI consumption
        const formattedTools = tools.map(tool => ({
            id: getMCPToolId(tool.serverName, tool.name),
            name: tool.name,
            description: tool.description,
            serverName: tool.serverName,
            inputSchema: tool.inputSchema,
        }));

        return NextResponse.json({ tools: formattedTools });
    } catch (error) {
        console.error("[MCP Tools API] Error:", error);
        return NextResponse.json({ error: "Failed to get MCP tools" }, { status: 500 });
    }
}
