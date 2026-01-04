/**
 * Execute Command Tool
 *
 * AI tool wrapper for safe command execution within synced directories.
 * Follows the same patterns as ripgrep/tool.ts - runs directly on the server.
 */

import { tool, jsonSchema } from "ai";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import { executeCommandWithValidation } from "@/lib/command-execution";
import type {
    ExecuteCommandToolOptions,
    ExecuteCommandInput,
    ExecuteCommandToolResult,
} from "@/lib/command-execution/types";

/**
 * JSON Schema definition for the executeCommand tool input
 */
const executeCommandSchema = jsonSchema<ExecuteCommandInput>({
    type: "object",
    properties: {
        command: {
            type: "string",
            description:
                "Command to execute (e.g., 'npm', 'git', 'ls', 'dir'). Must be a valid executable.",
        },
        args: {
            type: "array",
            items: { type: "string" },
            description:
                "Command arguments as an array (e.g., ['run', 'build'] for 'npm run build')",
        },
        cwd: {
            type: "string",
            description:
                "Working directory for the command. Must be within synced folders. If omitted, uses the first synced folder.",
        },
        timeout: {
            type: "number",
            description:
                "Timeout in milliseconds (default: 30000 = 30 seconds). Maximum allowed: 300000 (5 minutes).",
        },
    },
    required: ["command"],
    additionalProperties: false,
});

/**
 * Format command output for AI consumption
 */
function formatOutput(result: ExecuteCommandToolResult): string {
    const lines: string[] = [];

    if (result.status === "success") {
        lines.push(
            `✓ Command executed successfully (exit code: ${result.exitCode ?? 0})`
        );
        if (result.executionTime) {
            lines.push(`  Time: ${result.executionTime}ms`);
        }
    } else if (result.status === "blocked") {
        lines.push(`✗ Command blocked: ${result.error}`);
    } else if (result.status === "no_folders") {
        lines.push(`✗ No synced folders: ${result.message}`);
    } else {
        lines.push(`✗ Command failed: ${result.error || "Unknown error"}`);
        if (result.exitCode !== null && result.exitCode !== undefined) {
            lines.push(`  Exit code: ${result.exitCode}`);
        }
    }

    if (result.stdout && result.stdout.trim()) {
        lines.push("");
        lines.push("=== OUTPUT ===");
        lines.push(result.stdout);
    }

    if (result.stderr && result.stderr.trim()) {
        lines.push("");
        lines.push("=== ERRORS ===");
        lines.push(result.stderr);
    }

    return lines.join("\n");
}

/**
 * Create the executeCommand AI tool
 */
export function createExecuteCommandTool(options: ExecuteCommandToolOptions) {
    const { characterId } = options;

    return tool({
        description: `Execute shell commands safely within synced directories.

**Security:**
- Commands only run within indexed/synced folders
- Dangerous commands (rm, sudo, format, etc.) are blocked
- 30-second timeout by default
- Output size limits prevent memory issues

**Common Use Cases:**
- Run tests: executeCommand({ command: "npm", args: ["test"] })
- Check git status: executeCommand({ command: "git", args: ["status"] })
- Install deps: executeCommand({ command: "npm", args: ["install"] })
- List files: executeCommand({ command: "ls", args: ["-la"] })

**Parameters:**
- command: The executable to run
- args: Array of arguments (optional)
- cwd: Working directory (optional, defaults to first synced folder)
- timeout: Max execution time in ms (optional, default 30000)`,

        inputSchema: executeCommandSchema,

        execute: async (
            input: ExecuteCommandInput
        ): Promise<ExecuteCommandToolResult> => {
            // Validate characterId
            if (!characterId) {
                return {
                    status: "error",
                    error: "No agent context available. Command execution requires an agent with synced folders.",
                };
            }

            const { command, args = [], cwd, timeout } = input;

            // Validate command is provided
            if (!command || typeof command !== "string" || command.trim() === "") {
                return {
                    status: "error",
                    error: 'Missing or invalid command. Use: executeCommand({ command: "npm", args: ["test"] })',
                };
            }

            // Get synced folders for this agent
            let syncedFolders: string[];
            try {
                const folders = await getSyncFolders(characterId);
                syncedFolders = folders.map((f) => f.folderPath);

                if (syncedFolders.length === 0) {
                    return {
                        status: "no_folders",
                        message:
                            "No synced folders configured. Add synced folders for this agent to enable command execution.",
                    };
                }
            } catch (error) {
                return {
                    status: "error",
                    error: `Failed to get synced folders: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
            }

            // Determine working directory
            let executionDir = cwd;
            if (!executionDir) {
                // Use first synced folder as default
                executionDir = syncedFolders[0];
            }

            try {
                // Execute command with validation using the core executor
                const result = await executeCommandWithValidation(
                    {
                        command: command.trim(),
                        args,
                        cwd: executionDir,
                        timeout: Math.min(timeout || 30000, 300000), // Max 5 minutes
                        characterId: characterId,
                    },
                    syncedFolders // Whitelist of allowed directories (second parameter)
                );

                const toolResult: ExecuteCommandToolResult = {
                    status: result.success
                        ? "success"
                        : result.error?.includes("blocked")
                            ? "blocked"
                            : "error",
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    executionTime: result.executionTime,
                    error: result.error,
                };

                // Log formatted output for debugging
                console.log("[executeCommand]", formatOutput(toolResult));

                return toolResult;
            } catch (error) {
                return {
                    status: "error",
                    error: `Execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
            }
        },
    });
}
