/**
 * Execute Command Tool
 *
 * AI tool wrapper for safe command execution within synced directories.
 * Follows the same patterns as ripgrep/tool.ts - runs directly on the server.
 */

import { tool, jsonSchema } from "ai";
import fs from "fs/promises";
import path from "path";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import {
    executeCommandWithValidation,
    startBackgroundProcess,
    getBackgroundProcess,
    killBackgroundProcess,
    listBackgroundProcesses,
    cleanupBackgroundProcesses,
} from "@/lib/command-execution";
import { readTerminalLog } from "@/lib/command-execution/log-manager";
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

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function resolveClaudePluginRootPlaceholder(command: string): Promise<string> {
    const placeholder = "${CLAUDE_PLUGIN_ROOT}";
    if (!command.includes(placeholder)) {
        return command;
    }

    const suffix = command.split(placeholder).slice(1).join(placeholder);
    const normalizedSuffix = suffix.replace(/^[\\/]+/, "");
    const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (envRoot && await pathExists(path.join(envRoot, normalizedSuffix))) {
        return command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, envRoot);
    }

    const pluginBases = [
        path.join(process.cwd(), "test_plugins"),
        path.join(process.cwd(), ".local-data", "plugins"),
        process.env.LOCAL_DATA_PATH ? path.join(process.env.LOCAL_DATA_PATH, "plugins") : null,
    ].filter((value): value is string => Boolean(value));

    for (const base of pluginBases) {
        let entries;
        try {
            entries = await fs.readdir(base, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const candidateRoot = path.join(base, entry.name);
            if (await pathExists(path.join(candidateRoot, normalizedSuffix))) {
                return command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, candidateRoot);
            }
        }
    }

    return command;
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
const executeCommandSchema = jsonSchema<ExecuteCommandInput & { logId?: string }>({
    type: "object",
    title: "ExecuteCommandInput",
    description: "Input schema for safe command execution within synced directories",
    properties: {
        command: {
            type: "string",
            description:
                "Command to execute (e.g., 'npm', 'git', 'ls', 'dir'). Use 'readLog' to read a full truncated output.",
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
                "Timeout in milliseconds. Defaults: 30s for most commands, 120s for package managers (npm, npx, yarn, etc.). Max: 600000 (10 min).",
        },
        background: {
            type: "boolean",
            description:
                "Run in background mode. Returns immediately with a processId. Use processId to check status later. Ideal for long-running commands like npm install, npx create-*, builds, etc.",
        },
        processId: {
            type: "string",
            description:
                'Check status of a background process. Pass the processId returned from a background execution. Use command="kill" with processId to terminate a background process, or command="list" to see all background processes.',
        },
        logId: {
            type: "string",
            description: "The log ID to read when command is 'readLog'.",
        },
        confirmRemoval: {
            type: "boolean",
            description:
                "Required for removal commands (rm/rmdir/del/erase/rd). Set true only when deletion is explicitly intended.",
        },
    },
    required: [],
    additionalProperties: false,
});


/**
 * Create the executeCommand AI tool
 */
export function createExecuteCommandTool(options: ExecuteCommandToolOptions) {
    const { characterId } = options;

    return tool({
        description: `Execute shell commands safely within synced directories. Supports foreground and background execution.

**Security:**
- Commands only run within indexed/synced folders
- Removal commands require explicit confirmation (\`confirmRemoval: true\`)
- Smart default timeouts (30s normal, 120s for package managers)
- Output size limits prevent memory issues

**Common Use Cases:**
- Run tests: executeCommand({ command: "npm", args: ["test"] })
- Check git status: executeCommand({ command: "git", args: ["status"] })
- Install deps: executeCommand({ command: "npm", args: ["install"] })
- Read full truncated log: executeCommand({ command: "readLog", logId: "..." })
- Check background process: executeCommand({ processId: "bg-123" })
- Kill background process: executeCommand({ command: "kill", processId: "bg-123" })
- List background processes: executeCommand({ command: "list" })

**Background Mode:**
Use background: true for commands that take a long time (npm install, npx create-*, builds).
The tool returns immediately with a processId. Poll with processId to check status and get output.

**Parameters:**
- command: The executable (e.g., "python"). Or "kill"/"list" for background process management. Or 'readLog' to retrieve full output.
- args: Array of arguments (optional). For Python inline scripts, pass script as ONE arg after "-c"
- cwd: Working directory (optional, defaults to first synced folder)
- timeout: Max execution time in ms (auto-detected based on command type)
- background: Run in background and return processId (default: false)
- processId: Check/manage a background process by its ID
- logId: The log ID to read when command is 'readLog'
- confirmRemoval: Must be true for removal commands (rm/rmdir/del/erase/rd)`,

        inputSchema: executeCommandSchema,

        execute: async (
            input: ExecuteCommandInput & { logId?: string }
        ): Promise<ExecuteCommandToolResult> => {
            // Validate characterId
            if (!characterId) {
                return {
                    status: "error",
                    error: "No agent context available. Command execution requires an agent with synced folders.",
                };
            }

            const { command, args = [], cwd, timeout, background, processId, logId, confirmRemoval = false } = input;

            // ── Read Log ────────────────────────────────────────────────
            if (command === "readLog" && logId) {
                const fullLog = readTerminalLog(logId);
                if (!fullLog) {
                    return {
                        status: "error",
                        error: `Log with ID '${logId}' not found. It may have been cleaned up or never existed.`,
                    };
                }
                return {
                    status: "success",
                    stdout: fullLog,
                    message: `Retrieved full log for ID '${logId}'.`,
                };
            }

            // ── Background process management ────────────────────────────
            // Check status of a background process
            if (processId && (!command || command === "status")) {
                const info = getBackgroundProcess(processId);
                if (!info) {
                    return {
                        status: "error",
                        error: `No background process found with ID '${processId}'. It may have been cleaned up.`,
                    };
                }
                const elapsed = Math.round((Date.now() - info.startedAt) / 1000);
                if (info.running) {
                    return {
                        status: "running",
                        processId: info.id,
                        stdout: info.stdout,
                        stderr: info.stderr,
                        message: `Process '${info.command} ${info.args.join(" ")}' still running (${elapsed}s elapsed).`,
                    };
                }
                return {
                    status: info.exitCode === 0 ? "success" : "error",
                    processId: info.id,
                    stdout: info.stdout,
                    stderr: info.stderr,
                    exitCode: info.exitCode,
                    executionTime: Date.now() - info.startedAt,
                    message: `Process finished after ${elapsed}s with exit code ${info.exitCode}.`,
                    logId: info.logId,
                };
            }

            // Kill a background process
            if (processId && command === "kill") {
                const killed = killBackgroundProcess(processId);
                if (!killed) {
                    return { status: "error", error: `No background process found with ID '${processId}'.` };
                }
                return { status: "success", message: `Background process '${processId}' terminated.` };
            }

            // List all background processes
            if (command === "list" && !processId) {
                // Periodically clean up old finished processes
                cleanupBackgroundProcesses();
                const procs = listBackgroundProcesses();
                if (procs.length === 0) {
                    return { status: "success", message: "No background processes." };
                }
                const lines = procs.map((p) => {
                    const elapsed = Math.round(p.elapsed / 1000);
                    return `[${p.id}] ${p.running ? "RUNNING" : "DONE"} (${elapsed}s) ${p.command}`;
                });
                return { status: "success", stdout: lines.join("\n"), message: `${procs.length} background process(es).` };
            }

            // ── Normal command execution ─────────────────────────────────
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
                const resolvedCommand = await resolveClaudePluginRootPlaceholder(command);
                const normalizedInput = normalizeExecuteCommandInput(resolvedCommand, args);

                // ── Background execution ────────────────────────────────
                if (background) {
                    const maxBgTimeout = 600_000; // 10 min
                    const bgResult = await startBackgroundProcess(
                        {
                            command: normalizedInput.command,
                            args: normalizedInput.args,
                            cwd: executionDir,
                            timeout: Math.min(timeout || 600_000, maxBgTimeout),
                            characterId: characterId,
                            confirmRemoval,
                        },
                        syncedFolders
                    );

                    if (bgResult.error) {
                        return { status: "error", error: bgResult.error };
                    }

                    console.log(`[executeCommand] Background process started: ${bgResult.processId}`);
                    return {
                        status: "background_started",
                        processId: bgResult.processId,
                        message: `Background process started. Use processId '${bgResult.processId}' to check status.`,
                    };
                }

                // ── Foreground execution ─────────────────────────────────
                const maxTimeout = 600_000; // 10 min for foreground too
                const result = await executeCommandWithValidation(
                     {
                         command: normalizedInput.command,
                         args: normalizedInput.args,
                         cwd: executionDir,
                         timeout: timeout ? Math.min(timeout, maxTimeout) : undefined, // let executor pick smart default
                         characterId: characterId,
                         confirmRemoval,
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
                    logId: result.logId,
                    isTruncated: result.isTruncated,
                };

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
