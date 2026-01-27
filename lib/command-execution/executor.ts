/**
 * Command Executor
 * 
 * Safe command execution using child_process.spawn.
 * Implements security measures:
 * - Shell execution (shell: true) - Required for Windows cmd.exe compatibility
 * - Sandboxed environment variables
 * - Timeout and output size limits
 * - Integration with validation and logging
 */

import { spawn, ChildProcess } from "child_process";
import { validateCommand, validateExecutionDirectory } from "./validator";
import { commandLogger } from "./logger";
import type { ExecuteOptions, ExecuteResult } from "./types";

/**
 * Default configuration values
 */
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_OUTPUT_SIZE = 1048576; // 1MB

/**
 * Build a minimal, safe environment for command execution
 */
function buildSafeEnvironment(): Record<string, string | undefined> {
    return {
        // Minimal environment - only pass safe variables
        PATH: process.env.PATH,
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
        // Explicitly unset dangerous vars by not including them
        // NODE_OPTIONS, LD_PRELOAD, etc. are NOT passed
    };
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
        timeout = DEFAULT_TIMEOUT,
        maxOutputSize = DEFAULT_MAX_OUTPUT_SIZE,
    } = options;

    const context = { characterId };
    const startTime = Date.now();

    // Log execution attempt
    commandLogger.logExecutionStart(command, args, cwd, context);

    // Validate command
    const cmdValidation = validateCommand(command, args);
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

    // Get allowed paths for this character (passed from caller or fetched)
    // The caller is responsible for fetching synced folders
    // For now, we trust the cwd has been validated externally
    // In the full implementation, we'd call getSyncFolders here

    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let outputSize = 0;
        let killed = false;
        let timeoutId: NodeJS.Timeout | null = null;
        let child: ChildProcess;

        try {
            // Spawn process
            // - Unix: shell: false to pass arguments directly (avoids quote/special char issues)
            // - Windows: shell: true for PATH resolution and .bat/.cmd support
            // Security is provided by command validation (blocklist) and path validation.
            //
            // Note for AI: On Windows use 'dir' instead of 'ls', 'type' instead of 'cat'
            const isWindows = process.platform === "win32";
            child = spawn(command, args, {
                cwd,
                timeout, // Built-in timeout
                shell: isWindows, // Only use shell on Windows
                windowsHide: true, // Hide console window on Windows
                env: buildSafeEnvironment() as NodeJS.ProcessEnv,
            });


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

                resolve({
                    success: !killed && code === 0,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code,
                    signal: signal,
                    error: killed ? "Process terminated due to timeout or output limit" : undefined,
                    executionTime,
                });
            });

            // Handle spawn errors
            child.on("error", (error) => {
                if (timeoutId) clearTimeout(timeoutId);

                const executionTime = Date.now() - startTime;
                commandLogger.logExecutionError(command, error.message, context);

                resolve({
                    success: false,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: null,
                    signal: null,
                    error: error.message,
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
