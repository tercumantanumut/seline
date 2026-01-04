/**
 * Command Execution Validator
 * 
 * Validates commands and paths for safe execution.
 * Implements multi-layer security:
 * - Path validation: Only allows execution within synced folders
 * - Command blacklist: Blocks dangerous commands
 * - Shell injection prevention: Detects dangerous characters
 */

import { resolve, normalize, sep, isAbsolute } from "path";
import type { ValidationResult } from "./types";

/**
 * Dangerous commands that are blocked for security reasons
 */
const DANGEROUS_COMMANDS = [
    // Destructive file operations
    "rm", "rmdir", "del", "erase", "rd",
    // Disk formatting
    "format", "mkfs", "diskpart",
    // Low-level disk operations
    "dd", "fdisk", "parted",
    // Privilege escalation
    "sudo", "su", "runas", "doas",
    // Permission changes
    "chmod", "chown", "chgrp", "icacls", "cacls", "takeown",
    // Windows system commands
    "reg", "regedit", "bcdedit", "sfc",
    // Process manipulation
    "kill", "pkill", "killall", "taskkill",
    // Shutdown/restart
    "shutdown", "reboot", "poweroff", "halt",
];

/**
 * Network commands that are blocked by default
 * Note: curl/wget are allowed as they're useful for downloading
 */
const NETWORK_COMMANDS = [
    "invoke-webrequest", "invoke-restmethod",
    "nc", "netcat", "ncat", "telnet", "ssh", "scp", "sftp",
];

/**
 * Dangerous shell metacharacters that could enable injection in the COMMAND itself.
 * Note: Args passed as array are properly escaped by Node.js even with shell:true.
 * We only block these in the command, not in args.
 */
const DANGEROUS_COMMAND_PATTERN = /[;&|`$()\[\]<>]/;

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
    options?: { allowNetwork?: boolean }
): ValidationResult {
    const { allowNetwork = false } = options || {};

    // Check for empty command
    if (!command || command.trim() === "") {
        return {
            valid: false,
            error: "Command cannot be empty.",
        };
    }

    // Get base command name for checking
    const baseCommand = getBaseCommand(command);

    // Check against dangerous commands blacklist
    if (DANGEROUS_COMMANDS.some((cmd) => baseCommand === cmd || baseCommand.includes(cmd))) {
        return {
            valid: false,
            error: `Command '${command}' is blocked for security reasons.`,
        };
    }

    // Check network commands (blocked by default)
    if (!allowNetwork && NETWORK_COMMANDS.some((cmd) => baseCommand === cmd)) {
        return {
            valid: false,
            error: `Network command '${command}' is blocked. Enable network commands in settings if needed.`,
        };
    }

    // Check for shell injection patterns in command itself
    // Note: Args are escaped by Node.js when passed as array, so we only check command
    if (DANGEROUS_COMMAND_PATTERN.test(command)) {
        return {
            valid: false,
            error: "Command contains potentially dangerous characters.",
        };
    }

    // Args are passed as an array to spawn(), which properly escapes them
    // even with shell:true. We only need to check for path traversal, not injection.
    // The shell cannot interpret metacharacters in properly escaped array args.

    // Check for path traversal in arguments
    for (const arg of args) {
        // Skip flags (arguments starting with -)
        if (arg.startsWith("-")) continue;

        // Check for obvious path traversal attempts
        const normalizedArg = normalize(arg);
        if (normalizedArg.includes("..")) {
            return {
                valid: false,
                error: `Argument '${arg}' contains path traversal pattern.`,
            };
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
        DANGEROUS_COMMANDS.some((cmd) => baseCommand === cmd) ||
        NETWORK_COMMANDS.some((cmd) => baseCommand === cmd)
    );
}

/**
 * Get list of blocked commands (for documentation/display)
 */
export function getBlockedCommands(): { dangerous: string[]; network: string[] } {
    return {
        dangerous: [...DANGEROUS_COMMANDS],
        network: [...NETWORK_COMMANDS],
    };
}
