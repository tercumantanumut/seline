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
import { validateCommand, validateExecutionDirectory } from "./validator";
import { commandLogger } from "./logger";
import { saveTerminalLog } from "./log-manager";
import { isEBADFError, spawnWithFileCapture } from "@/lib/spawn-utils";
import type { ExecuteOptions, ExecuteResult, BackgroundProcessInfo } from "./types";
import {
    getBundledRuntimeInfo,
    buildSafeEnvironment,
    resolveBundledNodeCommand,
    buildNotFoundDiagnostic,
} from "./executor-runtime";
import {
    BACKGROUND_TIMEOUT,
    DEFAULT_MAX_OUTPUT_SIZE,
    resolveTimeout,
    needsWindowsShell,
    wrapWithRTK,
    getRtkRgFallbackReason,
    buildExecuteSearchMetadata,
} from "./executor-rtk";
import { runEBADFFallback } from "./executor-ebadf";

// EBADF helpers imported from @/lib/spawn-utils
// Re-export for backwards compatibility with tests
export { isEBADFError, spawnWithFileCapture } from "@/lib/spawn-utils";

// ── Background Process Registry ──────────────────────────────────────────────
const backgroundProcesses = new Map<string, BackgroundProcessInfo>();
const MAX_BACKGROUND_OUTPUT = 1048576; // 1MB per stream
let bgIdCounter = 0;

function nextBgId(): string {
    return `bg-${Date.now()}-${++bgIdCounter}`;
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

    const runtime = getBundledRuntimeInfo();
    const baseEnv = buildSafeEnvironment(runtime) as NodeJS.ProcessEnv;

    // Wrap with RTK if enabled, otherwise resolve bundled Node/npm/npx in packaged builds.
    const wrapped = wrapWithRTK(command, args, baseEnv);
    const resolved = wrapped.usingRTK
        ? { command: wrapped.command, args: wrapped.args, env: wrapped.env, resolution: null }
        : resolveBundledNodeCommand(wrapped.command, wrapped.args, wrapped.env, runtime);

    const {
        command: finalCommand,
        args: finalArgs,
        env: finalEnv,
    } = resolved;

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
        // macOS Electron utilityProcess: spawn() itself can throw EBADF
        // synchronously when pipe creation fails.  Retry via file-capture.
        if (isEBADFError(error) && process.platform === "darwin") {
            console.warn("[Command Executor] spawn() threw EBADF on background process – retrying with file-capture fallback");
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
                process: null as unknown as ChildProcess,
                timeoutId: null,
            };
            backgroundProcesses.set(id, info);
            commandLogger.logExecutionStart(command, args, cwd, { characterId });

            // Run asynchronously; the caller gets the processId immediately.
            spawnWithFileCapture(
                finalCommand, finalArgs, resolvedCwd, finalEnv, timeout, maxOutputSize,
            ).then((fb) => {
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
            }).catch((fbErr) => {
                info.running = false;
                info.stderr += `\n[EBADF file-capture fallback failed] ${fbErr instanceof Error ? fbErr.message : fbErr}`;
                commandLogger.logExecutionError(command, info.stderr, { characterId });
            });

            return { processId: id };
        }

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
        forceDirectExecution = false,
        fallbackReasonForDirectExecution,
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

        const runtime = getBundledRuntimeInfo();
        const baseEnv = buildSafeEnvironment(runtime) as NodeJS.ProcessEnv;
        const wrapped = wrapWithRTK(command, args, baseEnv, { forceDirect: forceDirectExecution });
        const resolved = wrapped.usingRTK
            ? { command: wrapped.command, args: wrapped.args, env: wrapped.env, resolution: null }
            : resolveBundledNodeCommand(wrapped.command, wrapped.args, wrapped.env, runtime);

        const {
            command: finalCommand,
            args: finalArgs,
            env: finalEnv,
        } = resolved;
        const searchMetadata = buildExecuteSearchMetadata({
            originalCommand: command,
            finalCommand,
            wrappedByRTK: wrapped.usingRTK,
            fallbackTriggered: forceDirectExecution,
            fallbackReason: forceDirectExecution ? fallbackReasonForDirectExecution : undefined,
        });

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

                const fallbackReason = getRtkRgFallbackReason({
                    command,
                    wrappedByRTK: wrapped.usingRTK,
                    stderr,
                });

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
                    searchMetadata: fallbackReason
                        ? buildExecuteSearchMetadata({
                            originalCommand: command,
                            finalCommand,
                            wrappedByRTK: wrapped.usingRTK,
                            fallbackTriggered: true,
                            fallbackReason,
                        })
                        : searchMetadata,
                });
            });

            // Handle spawn errors — including EBADF fallback
            child.on("error", async (error) => {
                if (timeoutId) clearTimeout(timeoutId);

                // macOS Electron utilityProcess: pipe creation can fail with EBADF.
                // Fall back to file-capture (no pipes; stdout/stderr written to temp files).
                if (isEBADFError(error) && process.platform === "darwin") {
                    console.warn("[Command Executor] spawn EBADF – retrying with file-capture fallback");
                    resolve(await runEBADFFallback({
                        command, finalCommand, finalArgs, cwd, finalEnv,
                        timeout, maxOutputSize, startTime,
                        wrappedByRTK: wrapped.usingRTK, characterId, baseSearchMetadata: searchMetadata,
                    }));
                    return;
                }

                const executionTime = Date.now() - startTime;

                // Provide more helpful error messages for common issues
                let errorMessage = error.message;

                // Check if it's a "command not found" error
                if (error.message.includes("ENOENT") || error.message.includes("spawn") && error.message.includes("not found")) {
                    const diagnostic = buildNotFoundDiagnostic(command, runtime, finalEnv, resolved.resolution);
                    errorMessage = `Command '${command}' not found. ${errorMessage}\n\n${diagnostic}\n\nTip: For Node.js commands (npm, npx, node), Seline expects bundled binaries under resources/standalone.`;
                }

                commandLogger.logExecutionError(command, errorMessage, context);

                const fallbackReason = getRtkRgFallbackReason({
                    command,
                    wrappedByRTK: wrapped.usingRTK,
                    stderr,
                    error: errorMessage,
                });

                resolve({
                    success: false,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: null,
                    signal: null,
                    error: errorMessage,
                    executionTime,
                    searchMetadata: fallbackReason
                        ? buildExecuteSearchMetadata({
                            originalCommand: command,
                            finalCommand,
                            wrappedByRTK: wrapped.usingRTK,
                            fallbackTriggered: true,
                            fallbackReason,
                        })
                        : searchMetadata,
                });
            });
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);

            // macOS Electron utilityProcess: spawn() itself can throw EBADF
            // synchronously when pipe creation fails.  Retry via file-capture.
            if (isEBADFError(error) && process.platform === "darwin") {
                console.warn("[Command Executor] spawn() threw EBADF synchronously – retrying with file-capture fallback");
                runEBADFFallback({
                    command, finalCommand, finalArgs, cwd, finalEnv,
                    timeout, maxOutputSize, startTime,
                    wrappedByRTK: wrapped.usingRTK, characterId, baseSearchMetadata: searchMetadata,
                }).then(resolve);
                return;
            }

            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            commandLogger.logExecutionError(command, errorMessage, context);
            const fallbackReason = getRtkRgFallbackReason({
                command,
                wrappedByRTK: wrapped.usingRTK,
                error: errorMessage,
            });

            resolve({
                success: false,
                stdout: "",
                stderr: "",
                exitCode: null,
                signal: null,
                error: errorMessage,
                executionTime,
                searchMetadata: fallbackReason
                    ? buildExecuteSearchMetadata({
                        originalCommand: command,
                        finalCommand,
                        wrappedByRTK: wrapped.usingRTK,
                        fallbackTriggered: true,
                        fallbackReason,
                    })
                    : searchMetadata,
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
            searchMetadata: buildExecuteSearchMetadata({
                originalCommand: options.command,
                finalCommand: options.command,
                wrappedByRTK: false,
            }),
        };
    }

    // Execute with validated path
    return executeCommand({
        ...options,
        cwd: cwdValidation.resolvedPath ?? options.cwd,
    });
}
