import { NextRequest, NextResponse } from "next/server";
import { MCPClientManager } from "@/lib/mcp/client-manager";
import { requireAuth } from "@/lib/auth/local-auth";

/**
 * GET /api/mcp/reload-status?characterId=xxx
 * Get current MCP reload status for a character
 */
export async function GET(request: NextRequest) {
    try {
        // Authenticate request
        await requireAuth(request);

        const characterId = request.nextUrl.searchParams.get("characterId");

        if (!characterId) {
            return NextResponse.json(
                { error: "characterId is required" },
                { status: 400 }
            );
        }

        const manager = MCPClientManager.getInstance();
        const status = manager.getReloadStatus(characterId);

        return NextResponse.json(status);
    } catch (error) {
        if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        console.error("[API] Failed to get MCP reload status:", error);
        return NextResponse.json(
            { error: "Failed to get reload status" },
            { status: 500 }
        );
    }
}
