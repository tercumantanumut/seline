/**
 * Command Execution Logger
 * 
 * Structured logging for command execution events.
 * Integrates with existing Electron logging system.
 */

import type { CommandLogEntry } from "./types";

type LogLevel = "debug" | "info" | "warn" | "error" | "security";

/**
 * Command execution logger
 * Logs to console and optionally to file/renderer
 */
class CommandExecutionLogger {
    private isElectronMain = false;
    private debugLog: ((...args: unknown[]) => void) | null = null;
    private debugError: ((...args: unknown[]) => void) | null = null;

    constructor() {
        // Check if running in Electron main process
        if (typeof process !== "undefined" && process.versions?.electron) {
            this.isElectronMain = true;
        }
    }

    /**
     * Set external loggers (called from main.ts if in Electron)
     */
    setLoggers(
        debugLog: (...args: unknown[]) => void,
        debugError: (...args: unknown[]) => void
    ): void {
        this.debugLog = debugLog;
        this.debugError = debugError;
    }

    /**
     * Log a command execution event
     */
    log(
        level: LogLevel,
        event: string,
        data: Record<string, unknown>,
        context?: {
            userId?: string;
            characterId?: string;
            sessionId?: string;
        }
    ): void {
        const entry: CommandLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            category: "command_execution",
            event,
            data,
            ...context,
        };

        // Format message for console
        const prefix = `[CommandExec:${level}]`;
        const message = `${event}: ${JSON.stringify(data)}`;

        // Log to appropriate destination
        if (level === "error" || level === "security") {
            if (this.debugError) {
                this.debugError(prefix, message);
            } else {
                console.error(prefix, message);
            }
        } else {
            if (this.debugLog) {
                this.debugLog(prefix, message);
            } else {
                console.log(prefix, message);
            }
        }
    }

    /**
     * Log command validation result
     */
    logValidation(
        success: boolean,
        command: string,
        reason?: string,
        context?: { characterId?: string; cwd?: string }
    ): void {
        this.log(
            success ? "info" : "security",
            success ? "command_validated" : "command_blocked",
            {
                command,
                reason,
                ...context,
            }
        );
    }

    /**
     * Log command execution start
     */
    logExecutionStart(
        command: string,
        args: string[],
        cwd: string,
        context?: { userId?: string; characterId?: string; sessionId?: string }
    ): void {
        this.log(
            "info",
            "command_execution_started",
            {
                command,
                args,
                cwd,
            },
            context
        );
    }

    /**
     * Log command execution completion
     */
    logExecutionComplete(
        command: string,
        exitCode: number | null,
        executionTime: number,
        outputSize: { stdout: number; stderr: number },
        context?: { userId?: string; characterId?: string; sessionId?: string }
    ): void {
        this.log(
            exitCode === 0 ? "info" : "warn",
            "command_execution_completed",
            {
                command,
                exitCode,
                executionTime,
                outputSize,
            },
            context
        );
    }

    /**
     * Log command execution error
     */
    logExecutionError(
        command: string,
        error: string,
        context?: { userId?: string; characterId?: string; sessionId?: string }
    ): void {
        this.log(
            "error",
            "command_execution_failed",
            {
                command,
                error,
            },
            context
        );
    }

    /**
     * Log security event (blocked command, path traversal attempt, etc.)
     */
    logSecurityEvent(
        event: string,
        details: Record<string, unknown>,
        context?: { userId?: string; characterId?: string }
    ): void {
        this.log("security", event, details, context);
    }

    /**
     * Log debug information
     */
    debug(message: string, data?: Record<string, unknown>): void {
        this.log("debug", message, data || {});
    }
}

// Singleton instance
export const commandLogger = new CommandExecutionLogger();
