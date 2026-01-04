/**
 * Execute Command API Route
 *
 * POST endpoint for command execution in non-Electron environments.
 * Provides server-side command execution with authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
    executeCommandWithValidation,
    type ExecuteResult,
} from "@/lib/command-execution";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import { getCharacter } from "@/lib/characters/queries";

/**
 * Request body schema
 */
interface ExecuteCommandRequest {
    command: string;
    args: string[];
    cwd: string;
    characterId: string;
    timeout?: number;
}

/**
 * POST /api/execute-command
 *
 * Execute a command within synced directories.
 * Requires authentication.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ExecuteResult | { error: string }>> {
    try {
        // Check authentication
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Parse request body
        const body: ExecuteCommandRequest = await req.json();
        const { command, args, cwd, characterId, timeout } = body;

        // Validate required fields
        if (!command || typeof command !== "string") {
            return NextResponse.json(
                { error: "Invalid request: 'command' is required and must be a string" },
                { status: 400 }
            );
        }

        if (!characterId || typeof characterId !== "string") {
            return NextResponse.json(
                { error: "Invalid request: 'characterId' is required" },
                { status: 400 }
            );
        }

        if (!cwd || typeof cwd !== "string") {
            return NextResponse.json(
                { error: "Invalid request: 'cwd' is required and must be a string" },
                { status: 400 }
            );
        }

        // Verify character ownership
        const character = await getCharacter(characterId);
        if (!character || character.userId !== session.user.id) {
            return NextResponse.json(
                { error: "Access denied: Character not found or unauthorized" },
                { status: 403 }
            );
        }

        // Get allowed paths from synced folders
        const syncedFolders = await getSyncFolders(characterId);
        const allowedPaths = syncedFolders.map((f) => f.folderPath);

        if (allowedPaths.length === 0) {
            return NextResponse.json({
                success: false,
                stdout: "",
                stderr: "",
                exitCode: null,
                signal: null,
                error:
                    "No synced folders configured. Add synced folders to enable command execution.",
            });
        }

        // Execute command with validation
        const result = await executeCommandWithValidation(
            {
                command,
                args: Array.isArray(args) ? args : [],
                cwd,
                characterId,
                timeout: typeof timeout === "number" ? Math.min(timeout, 300000) : 30000,
            },
            allowedPaths
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error("[API] execute-command error:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : "Unknown error occurred",
            },
            { status: 500 }
        );
    }
}
