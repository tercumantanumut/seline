/**
 * Command Execution Validator
 * 
 * Validates commands and paths for safe execution.
 * Implements multi-layer security:
 * - Path validation: Only allows execution within synced folders
 * - Command confirmation: Requires explicit opt-in for removal commands
 */

import { resolve, normalize, sep, isAbsolute } from "path";
import type { ValidationResult } from "./types";

const REMOVAL_COMMANDS = ["rm", "rmdir", "del", "erase", "rd"];

const NETWORK_COMMANDS: string[] = [];

/**
 * Path traversal pattern - matches ".." only as a path segment
 * Catches: ../foo, foo/../bar, ..\\windows
 * Does NOT match: hello..world, SKILLS.md, ... (ellipsis)
 */
const PATH_TRAVERSAL_PATTERN = /(?:^|[/\\])\.\.(?:[/\\]|$)/;

/**
 * Validate that a directory is within allowed synced folders
 */
export async function validateExecutionDirectory(
    cwd: string,
    allowedPaths: string[]
): Promise<ValidationResult> {
    // Must have allowed paths
    if (allowedPaths.length === 0) {
        return {
            valid: false,
            error: "No synced folders configured. Add synced folders to enable command execution.",
        };
    }

    // Must be an absolute path
    if (!isAbsolute(cwd)) {
        return {
            valid: false,
            error: "Execution directory must be an absolute path.",
        };
    }

    // Normalize the path to prevent traversal attacks
    const normalizedCwd = normalize(cwd);

    // Check if within any allowed folder
    for (const allowedPath of allowedPaths) {
        const resolvedAllowed = resolve(allowedPath);
        const normalizedAllowed = normalize(resolvedAllowed);

        // Check if cwd is the allowed path or a subdirectory
        if (
            normalizedCwd === normalizedAllowed ||
            normalizedCwd.startsWith(normalizedAllowed + sep)
        ) {
            return {
                valid: true,
                resolvedPath: normalizedCwd,
            };
        }
    }

    return {
        valid: false,
        error: `Execution directory must be within synced folders. Allowed: ${allowedPaths.join(", ")}`,
    };
}

/**
 * Extract base command name from a path or command string
 */
function getBaseCommand(command: string): string {
    // Handle both forward and back slashes for cross-platform
    const parts = command.toLowerCase().split(/[\\/]/);
    const baseName = parts[parts.length - 1] || "";
    // Remove common extensions
    return baseName.replace(/\.(exe|cmd|bat|sh|ps1)$/i, "");
}

/**
 * Validate command for dangerous patterns
 */
export function validateCommand(
    command: string,
    args: string[],
    options?: { allowNetwork?: boolean; confirmRemoval?: boolean }
): ValidationResult {
    const { allowNetwork = false, confirmRemoval = false } = options || {};

    // Check for empty command
    if (!command || command.trim() === "") {
        return {
            valid: false,
            error: "Command cannot be empty.",
        };
    }

    // Get base command name for checking
    const baseCommand = getBaseCommand(command);

    // Removal commands require explicit opt-in from the caller.
    // Use exact match to avoid false positives on command names like "my-rm-tool".
    if (REMOVAL_COMMANDS.some((cmd) => baseCommand === cmd) && !confirmRemoval) {
        return {
            valid: false,
            error:
                `Command '${command}' is a removal command and requires explicit confirmation. ` +
                `Re-run with confirmRemoval: true if you intend to delete files.`,
        };
    }

    // Check network commands (blocked by default)
    if (!allowNetwork && NETWORK_COMMANDS.some((cmd) => baseCommand === cmd)) {
        return {
            valid: false,
            error: `Network command '${command}' is blocked. Enable network commands in settings if needed.`,
        };
    }

    // Args are passed as an array to spawn(), which properly escapes them
    // even with shell:true. Security depends on:
    // 1. Command validation/confirmation (checked above)
    // 2. Path validation (checked in executeCommandWithValidation)
    // 3. Platform-specific shell quoting for args (handled by Node.js)
    // We checks for path traversal here as an extra layer of defense.

    // Check for path traversal in arguments
    for (const arg of args) {
        // Check for path traversal inside the argument (including flag values)
        // We check before normalization because normalization resolves '..'
        // Match ".." only when it appears as a path segment (not just anywhere in text)
        // This catches: ../foo, foo/../bar, ..\\windows, but NOT: hello..world, SKILLS.md, ...
        if (PATH_TRAVERSAL_PATTERN.test(arg)) {
            return {
                valid: false,
                error: `Argument contains path traversal pattern.`,
            };
        }

        // Also check if it's a flag with a value that might be suspicious
        // e.g. --output=../../passwd
        if (arg.includes("=")) {
            const flagValue = arg.split("=")[1];
            if (flagValue && PATH_TRAVERSAL_PATTERN.test(flagValue)) {
                return {
                    valid: false,
                    error: `Argument contains path traversal pattern.`,
                };
            }
        }
    }

    return { valid: true };
}

/**
 * Check if a command is in the blocklist (for quick checks)
 */
export function isCommandBlocked(command: string): boolean {
    const baseCommand = getBaseCommand(command);
    return (
        REMOVAL_COMMANDS.some((cmd) => baseCommand === cmd) ||
        NETWORK_COMMANDS.some((cmd) => baseCommand === cmd)
    );
}

/**
 * Get list of blocked commands (for documentation/display)
 */
export function getBlockedCommands(): { dangerous: string[]; network: string[] } {
    return {
        dangerous: [...REMOVAL_COMMANDS],
        network: [...NETWORK_COMMANDS],
    };
}
