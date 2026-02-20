/**
 * Command Executor
 *
 * Safe command execution using child_process.spawn.
 * Implements security measures:
 * - Shell execution (shell: true) - Required for Windows cmd.exe compatibility
 * - Sandboxed environment variables
 * - Timeout and output size limits
 * - Integration with validation and logging
 *
 * EBADF note: On macOS inside Electron's utilityProcess, creating stdio pipes
 * can fail with EBADF (bad file descriptor).  When that happens we fall back to
 * spawnWithFileCapture(), which runs the command via /bin/sh with stdio set to
 * ["ignore","ignore","ignore"] and redirects output to private temp files.
 * Pattern from openclaw/openclaw#4932 (Oceanswave:fix/async-file-capture-ebadf-fallback).
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { validateCommand, validateExecutionDirectory } from "./validator";
import { commandLogger } from "./logger";
import { saveTerminalLog } from "./log-manager";
import { getRTKBinary, getRTKEnvironment, getRTKFlags, shouldUseRTK } from "@/lib/rtk";
import type { ExecuteOptions, ExecuteResult, BackgroundProcessInfo } from "./types";

/**
 * Default configuration values
 */
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_OUTPUT_SIZE = 1048576; // 1MB
// Note: This byte limit prevents memory/performance issues during execution.
// Projection/token limiting happens later in model/transport shaping paths.
// Canonical history persistence remains lossless where possible.

/**
 * Get the bundled Node.js binaries directory
 * Returns the path to standalone/node_modules/.bin if it exists in the packaged app
 */
function getBundledBinariesPath(): string | null {
    // In packaged Electron apps:
    // - Main process: process.resourcesPath is available
    // - Renderer/Next.js server: ELECTRON_RESOURCES_PATH env var is set
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        || process.env.ELECTRON_RESOURCES_PATH;

    if (!resourcesPath) {
        return null;
    }

    const binPath = join(resourcesPath, "standalone", "node_modules", ".bin");

    try {
        if (existsSync(binPath)) {
            return binPath;
        }
    } catch {
        // Ignore filesystem errors
    }

    return null;
}

/**
 * Build a minimal, safe environment for command execution
 * Includes bundled Node.js binaries in PATH for packaged apps
 */
function buildSafeEnvironment(): Record<string, string | undefined> {
    // Start with system PATH
    let pathValue = process.env.PATH || "";

    // Prepend bundled binaries directory if available
    const bundledBinPath = getBundledBinariesPath();
    if (bundledBinPath) {
        const pathSeparator = process.platform === "win32" ? ";" : ":";
        pathValue = bundledBinPath + pathSeparator + pathValue;
        console.log(`[Command Executor] Prepending bundled binaries to PATH: ${bundledBinPath}`);
    }

    return {
        // Minimal environment - only pass safe variables
        PATH: pathValue,
        HOME: process.env.HOME || process.env.USERPROFILE,
        USER: process.env.USER || process.env.USERNAME,
        LANG: process.env.LANG,
        TERM: process.env.TERM || "xterm-256color",
        // Platform-specific
        SYSTEMROOT: process.env.SYSTEMROOT, // Windows needs this
        COMSPEC: process.env.COMSPEC, // Windows command interpreter
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        USERPROFILE: process.env.USERPROFILE,
        // Pass ELECTRON_RESOURCES_PATH for child processes (like MCP servers)
        ELECTRON_RESOURCES_PATH: process.env.ELECTRON_RESOURCES_PATH,
        // Explicitly unset dangerous vars by not including them
        // NODE_OPTIONS, LD_PRELOAD, etc. are NOT passed
    };
}

// ── EBADF fallback helpers ────────────────────────────────────────────────────

/**
 * Returns true when the error is an EBADF (bad file descriptor) failure.
 * On macOS in Electron's utilityProcess, creating stdio pipes triggers EBADF.
 */
export function isEBADFError(error: Error): boolean {
    return (error as NodeJS.ErrnoException).code === "EBADF"
        || error.message.includes("EBADF");
}

/**
 * Shell-escape a single token for embedding inside single quotes.
 * e.g.  hello'world  →  'hello'\''world'
 */
function shQuote(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Spawn a command with stdout/stderr captured to temp files instead of pipes.
 *
 * On macOS in Electron's utilityProcess, creating stdio pipes fails with EBADF.
 * This fallback avoids all pipe creation by using stdio:["ignore","ignore","ignore"]
 * and redirecting command output to private temp files via /bin/sh, then reading
 * those files once the process exits.
 *
 * The temp directory is cleaned up asynchronously after results are read.
 */
export async function spawnWithFileCapture(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout: number,
    maxOutputSize: number,
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
}> {
    const tmpDir = await mkdtemp(join(tmpdir(), "seline-exec-"));
    const outFile = join(tmpDir, "out");
    const errFile = join(tmpDir, "err");

    try {
        // Build a shell command that redirects output to the temp files.
        // Every token is single-quote escaped so arguments with spaces or
        // special characters are handled safely.
        const shellCmd = [command, ...args].map(shQuote).join(" ")
            + ` >${shQuote(outFile)} 2>${shQuote(errFile)}`;

        let timedOut = false;

        const { exitCode, signal } = await new Promise<{
            exitCode: number | null;
            signal: NodeJS.Signals | null;
        }>((resolve, reject) => {
            const child = spawn("/bin/sh", ["-c", shellCmd], {
                cwd,
                env,
                // No pipes at all — this is the whole point of the fallback.
                stdio: ["ignore", "ignore", "ignore"],
                windowsHide: true,
            });

            let settled = false;
            const settle = (v: { exitCode: number | null; signal: NodeJS.Signals | null }) => {
                if (!settled) { settled = true; resolve(v); }
            };

            const timer = setTimeout(() => {
                timedOut = true;
                try { child.kill("SIGTERM"); } catch { /* already dead */ }
                setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ok */ } }, 5000);
            }, timeout);

            child.on("error", (err) => {
                clearTimeout(timer);
                if (!settled) { settled = true; reject(err); }
            });

            child.on("close", (code, sig) => {
                clearTimeout(timer);
                settle({ exitCode: code, signal: sig as NodeJS.Signals | null });
            });
        });

        const [rawOut, rawErr] = await Promise.all([
            readFile(outFile, "utf-8").catch(() => ""),
            readFile(errFile, "utf-8").catch(() => ""),
        ]);

        return {
            stdout: rawOut.slice(0, maxOutputSize),
            stderr: rawErr.slice(0, maxOutputSize),
            exitCode,
            signal,
            timedOut,
        };
    } finally {
        // Non-blocking cleanup; errors are silently ignored.
        rm(tmpDir, { recursive: true, force: true }).catch(() => { /* noop */ });
    }
}

// ── Background Process Registry ──────────────────────────────────────────────
const backgroundProcesses = new Map<string, BackgroundProcessInfo>();
const MAX_BACKGROUND_OUTPUT = 1048576; // 1MB per stream
let bgIdCounter = 0;

function nextBgId(): string {
    return `bg-${Date.now()}-${++bgIdCounter}`;
}

/**
 * Commands that typically need longer timeouts (package managers, scaffolders)
 */
const LONG_RUNNING_COMMANDS = new Set([
    "npm", "npx", "yarn", "pnpm", "pnpx",
    "pip", "pip3", "cargo", "go", "dotnet",
    "composer", "bundle", "gem", "mvn", "gradle",
]);

const LONG_RUNNING_TIMEOUT = 120_000; // 2 minutes
const BACKGROUND_TIMEOUT = 600_000;   // 10 minutes for background processes

/**
 * Resolve a smart default timeout: long-running package-manager commands get
 * 2 minutes instead of 30 seconds unless the caller explicitly overrides.
 */
function resolveTimeout(command: string, explicit?: number): number {
    if (explicit != null) return explicit;
    const base = command.trim().toLowerCase().replace(/\.(?:cmd|bat|exe)$/i, "");
    if (LONG_RUNNING_COMMANDS.has(base)) return LONG_RUNNING_TIMEOUT;
    return DEFAULT_TIMEOUT;
}

/**
 * Determine if a command needs `shell: true` on Windows.
 */
function needsWindowsShell(command: string): boolean {
    if (process.platform !== "win32") return false;
    const normalized = command.trim().toLowerCase();
    if (normalized.endsWith(".cmd") || normalized.endsWith(".bat")) return true;
    const cmdShimCommands = new Set([
        "npm", "npx", "yarn", "pnpm", "pnpx",
        "tsc", "eslint", "prettier", "jest", "vitest",
        "next", "nuxt", "vite", "webpack",
        "ts-node", "tsx",
    ]);
    if (cmdShimCommands.has(normalized)) return true;
    // cmd.exe built-ins
    return ["dir", "type", "copy", "move", "echo"].includes(normalized);
}

/**
 * Wrap command with RTK if enabled and supported
 * Returns modified command/args or original if RTK not applicable
 */
function wrapWithRTK(
    command: string,
    args: string[],
    baseEnv: NodeJS.ProcessEnv
): { command: string; args: string[]; usingRTK: boolean; env: NodeJS.ProcessEnv } {
    const direct = { command, args, usingRTK: false, env: baseEnv };

    // Check if RTK should be used for this command
    if (!shouldUseRTK(command)) {
        return direct;
    }

    const rtkBinary = getRTKBinary();
    if (!rtkBinary) {
        // RTK not available or not enabled - use original command
        return direct;
    }

    try {
        // Get RTK flags from settings
        const rtkFlags = getRTKFlags();

        // Build RTK command: rtk [flags] <command> <args...>
        const rtkArgs = [...rtkFlags, command, ...args];

        console.log(`[RTK] Wrapping command: ${command} ${args.join(" ")}`);
        console.log(`[RTK] RTK command: ${rtkBinary} ${rtkArgs.join(" ")}`);

        return {
            command: rtkBinary,
            args: rtkArgs,
            usingRTK: true,
            env: getRTKEnvironment(baseEnv),
        };
    } catch (error) {
        // If RTK wrapping fails, fall back to original command
        console.warn(`[RTK] Failed to wrap command, falling back to direct execution:`, error);
        return direct;
    }
}

/**
 * Start a command in the background. Returns immediately with a process ID.
 * The process continues running; call `getBackgroundProcess` to poll for output.
 *
 * @param options - Execution options (command, args, cwd, etc.)
 * @param allowedPaths - Array of allowed directory paths for validation
 * @returns Object with processId (or empty string on error) and optional error message
 */
export async function startBackgroundProcess(
    options: ExecuteOptions,
    allowedPaths: string[]
): Promise<{
    processId: string;
    error?: string;
}> {
    const { command, args, cwd, characterId, confirmRemoval } = options;
    const timeout = options.timeout ?? BACKGROUND_TIMEOUT;
    const maxOutputSize = options.maxOutputSize ?? MAX_BACKGROUND_OUTPUT;

    // Validate command
    const cmdValidation = validateCommand(command, args, { confirmRemoval });
    if (!cmdValidation.valid) {
        return { processId: "", error: cmdValidation.error };
    }

    // Validate working directory against allowed paths
    const cwdValidation = await validateExecutionDirectory(cwd, allowedPaths);
    if (!cwdValidation.valid) {
        return { processId: "", error: cwdValidation.error };
    }
    const resolvedCwd = cwdValidation.resolvedPath ?? cwd;

    const baseEnv = buildSafeEnvironment() as NodeJS.ProcessEnv;

    // Wrap with RTK if enabled
    const {
        command: finalCommand,
        args: finalArgs,
        env: finalEnv,
    } = wrapWithRTK(command, args, baseEnv);

    const id = nextBgId();

    try {
        const child = spawn(finalCommand, finalArgs, {
            cwd: resolvedCwd,
            shell: needsWindowsShell(finalCommand),
            // Use "pipe" for stdin rather than "ignore".  On macOS inside
            // Electron's utilityProcess "ignore" can itself trigger EBADF; we
            // close stdin immediately below to give the child EOF instead.
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            env: finalEnv,
        });
        child.stdin?.end(); // Send EOF — functionally identical to "ignore"

        const info: BackgroundProcessInfo = {
            id,
            command,
            args,
            cwd,
            startedAt: Date.now(),
            running: true,
            stdout: "",
            stderr: "",
            exitCode: null,
            signal: null,
            process: child,
            timeoutId: null,
        };

        let outputSize = 0;

        // Capture stdout
        child.stdout?.on("data", (chunk: Buffer) => {
            const data = chunk.toString();
            outputSize += data.length;
            if (outputSize <= maxOutputSize) {
                info.stdout += data;
            }
        });

        // Capture stderr
        child.stderr?.on("data", (chunk: Buffer) => {
            const data = chunk.toString();
            outputSize += data.length;
            if (outputSize <= maxOutputSize) {
                info.stderr += data;
            }
        });

        // Handle completion
        child.on("close", (code, signal) => {
            if (info.timeoutId) clearTimeout(info.timeoutId);
            info.running = false;
            info.exitCode = code;
            info.signal = signal;

            // Save full log for background process too
            info.logId = saveTerminalLog(info.stdout, info.stderr);

            commandLogger.logExecutionComplete(
                command, code, Date.now() - info.startedAt,
                { stdout: info.stdout.length, stderr: info.stderr.length },
                { characterId },
            );
        });

        // Handle spawn errors — including EBADF fallback
        child.on("error", async (error) => {
            // macOS Electron utilityProcess: pipe creation can fail with EBADF.
            // Re-run via file-capture (no pipes; output written to temp files).
            if (isEBADFError(error) && process.platform === "darwin") {
                console.warn("[Command Executor] spawn EBADF on background process – retrying with file-capture fallback");
                if (info.timeoutId) { clearTimeout(info.timeoutId); info.timeoutId = null; }

                try {
                    const fb = await spawnWithFileCapture(
                        finalCommand, finalArgs, resolvedCwd, finalEnv, timeout, maxOutputSize,
                    );
                    info.running = false;
                    info.exitCode = fb.exitCode;
                    info.signal = fb.signal;
                    info.stdout = fb.stdout;
                    info.stderr = fb.timedOut
                        ? fb.stderr + "\n[Background process timed out]"
                        : fb.stderr;
                    info.logId = saveTerminalLog(info.stdout, info.stderr);
                    commandLogger.logExecutionComplete(
                        command, fb.exitCode, Date.now() - info.startedAt,
                        { stdout: info.stdout.length, stderr: info.stderr.length },
                        { characterId },
                    );
                } catch (fbErr) {
                    info.running = false;
                    info.stderr += `\n[EBADF file-capture fallback failed] ${fbErr instanceof Error ? fbErr.message : fbErr}`;
                    commandLogger.logExecutionError(command, info.stderr, { characterId });
                }
                return;
            }

            if (info.timeoutId) clearTimeout(info.timeoutId);
            info.running = false;
            info.stderr += `\n[Spawn error] ${error.message}`;
            commandLogger.logExecutionError(command, error.message, { characterId });
        });

        // Background timeout
        info.timeoutId = setTimeout(() => {
            if (info.running) {
                info.running = false;
                info.stderr += "\n[Background process timed out]";
                try { child.kill("SIGTERM"); } catch { /* already dead */ }
                setTimeout(() => {
                    try { child.kill("SIGKILL"); } catch { /* already dead */ }
                }, 5000);
            }
        }, timeout);

        backgroundProcesses.set(id, info);
        commandLogger.logExecutionStart(command, args, cwd, { characterId });

        return { processId: id };
    } catch (error) {
        return {
            processId: "",
            error: error instanceof Error ? error.message : "Failed to spawn background process",
        };
    }
}

/**
 * Get the current status of a background process.
 */
export function getBackgroundProcess(processId: string): BackgroundProcessInfo | null {
    return backgroundProcesses.get(processId) ?? null;
}

/**
 * Kill a background process.
 */
export function killBackgroundProcess(processId: string): boolean {
    const info = backgroundProcesses.get(processId);
    if (!info) return false;
    if (!info.running) return true; // already done

    info.running = false;
    if (info.timeoutId) clearTimeout(info.timeoutId);
    try {
        info.process.kill("SIGTERM");
        setTimeout(() => {
            try { info.process.kill("SIGKILL"); } catch { /* ok */ }
        }, 3000);
    } catch { /* already dead */ }
    return true;
}

/**
 * List all background processes (for diagnostics).
 */
export function listBackgroundProcesses(): Array<{
    id: string;
    command: string;
    running: boolean;
    elapsed: number;
}> {
    const now = Date.now();
    return Array.from(backgroundProcesses.values()).map((p) => ({
        id: p.id,
        command: `${p.command} ${p.args.join(" ")}`,
        running: p.running,
        elapsed: now - p.startedAt,
    }));
}

/**
 * Clean up finished background processes older than the given age (ms).
 */
export function cleanupBackgroundProcesses(maxAge = 600_000): void {
    const now = Date.now();
    for (const [id, info] of Array.from(backgroundProcesses.entries())) {
        if (!info.running && now - info.startedAt > maxAge) {
            backgroundProcesses.delete(id);
        }
    }
}

/**
 * Execute a command safely with validation and sandboxing
 */
export async function executeCommand(options: ExecuteOptions): Promise<ExecuteResult> {
    const {
        command,
        args,
        cwd,
        characterId,
        confirmRemoval,
        maxOutputSize = DEFAULT_MAX_OUTPUT_SIZE,
    } = options;

    const timeout = resolveTimeout(command, options.timeout);
    const context = { characterId };
    const startTime = Date.now();

    // Log execution attempt
    commandLogger.logExecutionStart(command, args, cwd, context);

    // Validate command
    const cmdValidation = validateCommand(command, args, { confirmRemoval });
    commandLogger.logValidation(cmdValidation.valid, command, cmdValidation.error, { characterId, cwd });

    if (!cmdValidation.valid) {
        commandLogger.logSecurityEvent("command_blocked", {
            command,
            args,
            reason: cmdValidation.error,
        }, context);

        return {
            success: false,
            stdout: "",
            stderr: "",
            exitCode: null,
            signal: null,
            error: cmdValidation.error,
            executionTime: Date.now() - startTime,
        };
    }

    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let outputSize = 0;
        let killed = false;
        let timeoutId: NodeJS.Timeout | null = null;
        let child: ChildProcess;

        const baseEnv = buildSafeEnvironment() as NodeJS.ProcessEnv;
        const {
            command: finalCommand,
            args: finalArgs,
            env: finalEnv,
        } = wrapWithRTK(command, args, baseEnv);

        try {
            // Spawn process
            // - Unix: shell: false to pass arguments directly (avoids quote/special char issues)
            // - Windows: shell: true for PATH resolution and .bat/.cmd support
            // Security is provided by command validation (blocklist) and path validation.
            //
            // Note for AI: On Windows use 'dir' instead of 'ls', 'type' instead of 'cat'
            child = spawn(finalCommand, finalArgs, {
                cwd,
                timeout, // Built-in timeout
                shell: needsWindowsShell(finalCommand),
                // Use "pipe" for stdin rather than "ignore".  On macOS inside
                // Electron's utilityProcess "ignore" can itself trigger EBADF; we
                // close stdin immediately below to give the child EOF instead.
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true, // Hide console window on Windows
                env: finalEnv,
            });
            child.stdin?.end(); // Send EOF — functionally identical to "ignore"

            // Set up manual timeout as backup
            timeoutId = setTimeout(() => {
                if (!killed) {
                    killed = true;
                    child.kill("SIGTERM");
                    // Force kill after 5 seconds if SIGTERM doesn't work
                    setTimeout(() => {
                        try {
                            child.kill("SIGKILL");
                        } catch {
                            // Process already dead
                        }
                    }, 5000);
                }
            }, timeout);

            // Capture stdout
            child.stdout?.on("data", (chunk: Buffer) => {
                const data = chunk.toString();
                outputSize += data.length;

                if (outputSize > maxOutputSize) {
                    if (!killed) {
                        killed = true;
                        child.kill("SIGTERM");
                        stderr += "\n[Output size limit exceeded]";
                    }
                } else {
                    stdout += data;
                }
            });

            // Capture stderr
            child.stderr?.on("data", (chunk: Buffer) => {
                const data = chunk.toString();
                outputSize += data.length;

                if (outputSize > maxOutputSize) {
                    if (!killed) {
                        killed = true;
                        child.kill("SIGTERM");
                        stderr += "\n[Output size limit exceeded]";
                    }
                } else {
                    stderr += data;
                }
            });

            // Handle completion
            child.on("close", (code, signal) => {
                if (timeoutId) clearTimeout(timeoutId);

                const executionTime = Date.now() - startTime;

                // Log completion
                commandLogger.logExecutionComplete(
                    command,
                    code,
                    executionTime,
                    {
                        stdout: stdout.length,
                        stderr: stderr.length,
                    },
                    context
                );

                // Save full log
                const logId = saveTerminalLog(stdout, stderr);

                resolve({
                    success: !killed && code === 0,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code,
                    signal: signal,
                    error: killed ? "Process terminated due to timeout or output limit" : undefined,
                    executionTime,
                    logId,
                    isTruncated: false,
                });
            });

            // Handle spawn errors — including EBADF fallback
            child.on("error", async (error) => {
                if (timeoutId) clearTimeout(timeoutId);

                // macOS Electron utilityProcess: pipe creation can fail with EBADF.
                // Fall back to file-capture (no pipes; stdout/stderr written to temp files).
                if (isEBADFError(error) && process.platform === "darwin") {
                    console.warn("[Command Executor] spawn EBADF – retrying with file-capture fallback");
                    try {
                        const fb = await spawnWithFileCapture(
                            finalCommand, finalArgs, cwd, finalEnv, timeout, maxOutputSize,
                        );
                        const executionTime = Date.now() - startTime;
                        commandLogger.logExecutionComplete(
                            command, fb.exitCode, executionTime,
                            { stdout: fb.stdout.length, stderr: fb.stderr.length },
                            context,
                        );
                        const logId = saveTerminalLog(fb.stdout, fb.stderr);
                        resolve({
                            success: fb.exitCode === 0 && !fb.timedOut,
                            stdout: fb.stdout.trim(),
                            stderr: fb.stderr.trim(),
                            exitCode: fb.exitCode,
                            signal: fb.signal,
                            error: fb.timedOut ? "Process terminated due to timeout" : undefined,
                            executionTime,
                            logId,
                            isTruncated: false,
                        });
                    } catch (fbErr) {
                        const executionTime = Date.now() - startTime;
                        const msg = fbErr instanceof Error ? fbErr.message : "File-capture fallback failed";
                        commandLogger.logExecutionError(command, msg, context);
                        resolve({
                            success: false,
                            stdout: "",
                            stderr: "",
                            exitCode: null,
                            signal: null,
                            error: msg,
                            executionTime,
                        });
                    }
                    return;
                }

                const executionTime = Date.now() - startTime;

                // Provide more helpful error messages for common issues
                let errorMessage = error.message;

                // Check if it's a "command not found" error
                if (error.message.includes("ENOENT") || error.message.includes("spawn") && error.message.includes("not found")) {
                    const bundledBinPath = getBundledBinariesPath();
                    const pathInfo = bundledBinPath
                        ? `\n\nBundled binaries path: ${bundledBinPath}\nCurrent PATH: ${process.env.PATH?.split(process.platform === "win32" ? ";" : ":").slice(0, 3).join("\n  ")}`
                        : "\n\nNo bundled binaries found. Running in development mode or binaries not packaged.";

                    errorMessage = `Command '${command}' not found. ${errorMessage}${pathInfo}\n\nTip: For Node.js commands (npm, npx, node), ensure the app is properly packaged with bundled binaries.`;
                }

                commandLogger.logExecutionError(command, errorMessage, context);

                resolve({
                    success: false,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: null,
                    signal: null,
                    error: errorMessage,
                    executionTime,
                });
            });
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);

            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            commandLogger.logExecutionError(command, errorMessage, context);

            resolve({
                success: false,
                stdout: "",
                stderr: "",
                exitCode: null,
                signal: null,
                error: errorMessage,
                executionTime,
            });
        }
    });
}

/**
 * Execute a command with path validation
 * This is the main entry point that validates the cwd against allowed paths
 */
export async function executeCommandWithValidation(
    options: ExecuteOptions,
    allowedPaths: string[]
): Promise<ExecuteResult> {
    const startTime = Date.now();

    // Validate execution directory
    const cwdValidation = await validateExecutionDirectory(options.cwd, allowedPaths);

    if (!cwdValidation.valid) {
        commandLogger.logSecurityEvent("path_validation_failed", {
            cwd: options.cwd,
            reason: cwdValidation.error,
        }, { characterId: options.characterId });

        return {
            success: false,
            stdout: "",
            stderr: "",
            exitCode: null,
            signal: null,
            error: cwdValidation.error,
            executionTime: Date.now() - startTime,
        };
    }

    // Execute with validated path
    return executeCommand({
        ...options,
        cwd: cwdValidation.resolvedPath ?? options.cwd,
    });
}
