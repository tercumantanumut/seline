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

function isPythonExecutable(command: string): boolean {
    const normalized = command.trim().replace(/^["']|["']$/g, "").toLowerCase();
    return (
        normalized === "python" ||
        normalized === "python3" ||
        normalized === "python.exe" ||
        normalized === "python3.exe" ||
        normalized === "py" ||
        normalized === "py.exe"
    );
}

function stripOuterQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) return trimmed;
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

/**
 * Narrow compatibility shim for common LLM mistakes around Python inline scripts.
 * Keeps behavior unchanged for all other command shapes.
 */
export function normalizeExecuteCommandInput(
    command: string,
    args: string[]
): { command: string; args: string[] } {
    const trimmedCommand = command.trim();
    const normalizedArgs = Array.isArray(args) ? [...args] : [];

    // Case 1: command is a single string like:
    // "python -c from PIL import Image; print('ok')"
    if (normalizedArgs.length === 0) {
        const firstSpace = trimmedCommand.indexOf(" ");
        if (firstSpace > 0) {
            const executable = trimmedCommand.slice(0, firstSpace).trim();
            const remainder = trimmedCommand.slice(firstSpace + 1).trim();
            if (isPythonExecutable(executable) && remainder.startsWith("-c ")) {
                const script = stripOuterQuotes(remainder.slice(3));
                if (script.length > 0) {
                    return {
                        command: executable,
                        args: ["-c", script],
                    };
                }
            }
        }
    }

    // Case 2: args are split incorrectly after -c, e.g.:
    // args: ["-c", "from", "PIL", "import", "Image;print('ok')"]
    if (isPythonExecutable(trimmedCommand)) {
        const scriptFlagIndex = normalizedArgs.indexOf("-c");
        if (scriptFlagIndex >= 0 && normalizedArgs.length > scriptFlagIndex + 2) {
            const before = normalizedArgs.slice(0, scriptFlagIndex + 1);
            const script = stripOuterQuotes(normalizedArgs.slice(scriptFlagIndex + 1).join(" "));
            return {
                command: trimmedCommand,
                args: [...before, script],
            };
        }
    }

    return {
        command: trimmedCommand,
        args: normalizedArgs,
    };
}

/**
 * JSON Schema definition for the executeCommand tool input
 */
const executeCommandSchema = jsonSchema<ExecuteCommandInput>({
    type: "object",
    title: "ExecuteCommandInput",
    description: "Input schema for safe command execution within synced directories",
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
- List files (Windows): executeCommand({ command: "dir" })
- List files (macOS/Linux): executeCommand({ command: "ls", args: ["-la"] })
- Python inline scripts: executeCommand({ command: "python", args: ["-c", "print('hello')"] })

**Parameters:**
- command: The executable only (e.g., "python", not "python -c ...")
- args: Array of arguments (optional). For Python inline scripts, pass script as ONE arg after "-c"
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
                const normalizedInput = normalizeExecuteCommandInput(command, args);

                // Guardrail: Python on Windows is commonly invoked via cmd.exe (shell parsing),
                // but our executor uses spawn(argv) so the `-c` payload must be a single arg.
                // Some environments require the script itself to be quoted.
                if (
                    isPythonExecutable(normalizedInput.command) &&
                    normalizedInput.args[0] === "-c" &&
                    typeof normalizedInput.args[1] === "string"
                ) {
                    const script = normalizedInput.args[1];
                    const needsQuoteWrap =
                        script.length > 0 &&
                        !/^["']/.test(script.trim()) &&
                        /\s|;|\(|\)|\n/.test(script);
                    if (needsQuoteWrap) {
                        normalizedInput.args[1] = `"${script.replace(/\"/g, "\\\"")}"`;
                    }
                }

                // Execute command with validation using the core executor
                const result = await executeCommandWithValidation(
                     {
                         command: normalizedInput.command,
                         args: normalizedInput.args,
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
