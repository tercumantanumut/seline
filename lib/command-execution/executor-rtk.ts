/**
 * RTK (Runtime Toolkit) wrapping and ripgrep search-metadata helpers.
 * Also contains command timeout resolution and Windows-shell detection.
 *
 * Extracted from executor.ts to isolate RTK and search-metadata concerns.
 */

import { getRTKBinary, getRTKEnvironment, getRTKFlags, shouldUseRTK } from "@/lib/rtk";
import type { ExecuteSearchMetadata } from "./types";
import { normalizeExecutable } from "./executor-runtime";
import type { BundledRuntimeInfo } from "./executor-runtime";

// ── Timeout / output-size constants ──────────────────────────────────────────

export const DEFAULT_TIMEOUT = 30000;           // 30 seconds
export const LONG_RUNNING_TIMEOUT = 120_000;    // 2 minutes
export const BACKGROUND_TIMEOUT = 600_000;      // 10 minutes
// Note: This byte limit prevents memory/performance issues during execution.
// Projection/token limiting happens later in model/transport shaping paths.
// Canonical history persistence remains lossless where possible.
export const DEFAULT_MAX_OUTPUT_SIZE = 1048576; // 1MB

/**
 * Commands that typically need longer timeouts (package managers, scaffolders)
 */
export const LONG_RUNNING_COMMANDS = new Set([
    "npm", "npx", "yarn", "pnpm", "pnpx",
    "pip", "pip3", "cargo", "go", "dotnet",
    "composer", "bundle", "gem", "mvn", "gradle",
]);

/**
 * Resolve a smart default timeout: long-running package-manager commands get
 * 2 minutes instead of 30 seconds unless the caller explicitly overrides.
 */
export function resolveTimeout(command: string, explicit?: number): number {
    if (explicit != null) return explicit;
    const base = command.trim().toLowerCase().replace(/\.(?:cmd|bat|exe)$/i, "");
    if (LONG_RUNNING_COMMANDS.has(base)) return LONG_RUNNING_TIMEOUT;
    return DEFAULT_TIMEOUT;
}

/**
 * Determine if a command needs `shell: true` on Windows.
 */
export function needsWindowsShell(command: string): boolean {
    if (process.platform !== "win32") return false;
    const normalized = command.trim().toLowerCase();
    if (normalized.endsWith(".cmd") || normalized.endsWith(".bat")) return true;
    const cmdShimCommands = new Set([
        "npm", "npx", "yarn", "pnpm", "pnpx",
        "tsc", "eslint", "prettier", "jest", "vitest",
        "next", "nuxt", "vite", "webpack",
        "ts-node", "tsx", "apply_patch",
    ]);
    if (cmdShimCommands.has(normalized)) return true;
    return ["dir", "type", "copy", "move", "echo"].includes(normalized);
}

// ── RTK wrapping ──────────────────────────────────────────────────────────────

/**
 * Wrap command with RTK if enabled and supported.
 * Returns modified command/args or original if RTK not applicable.
 */
export function wrapWithRTK(
    command: string,
    args: string[],
    baseEnv: NodeJS.ProcessEnv,
    options: { forceDirect?: boolean } = {}
): { command: string; args: string[]; usingRTK: boolean; env: NodeJS.ProcessEnv } {
    const direct = { command, args, usingRTK: false, env: baseEnv };

    if (options.forceDirect) {
        return direct;
    }

    if (!shouldUseRTK(command)) {
        return direct;
    }

    const rtkBinary = getRTKBinary();
    if (!rtkBinary) {
        return direct;
    }

    try {
        const rtkFlags = getRTKFlags();
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
        console.warn(`[RTK] Failed to wrap command, falling back to direct execution:`, error);
        return direct;
    }
}

// ── Search metadata helpers ───────────────────────────────────────────────────

export function isShellRipgrepCommand(command: string): boolean {
    return normalizeExecutable(command) === "rg";
}

export function getRtkRgFallbackReason(params: {
    command: string;
    wrappedByRTK: boolean;
    stderr?: string;
    error?: string;
}): ExecuteSearchMetadata["fallbackReason"] | undefined {
    if (!params.wrappedByRTK || !isShellRipgrepCommand(params.command)) {
        return undefined;
    }

    const combined = `${params.stderr ?? ""}\n${params.error ?? ""}`.toLowerCase();
    if (combined.includes("unrecognized subcommand") && combined.includes("rg")) {
        return "rtk_rg_unrecognized_subcommand";
    }

    if (combined.includes("unknown command") && combined.includes("rg")) {
        return "rtk_rg_unknown_command";
    }

    return undefined;
}

export function buildExecuteSearchMetadata(params: {
    originalCommand: string;
    finalCommand: string;
    wrappedByRTK: boolean;
    fallbackTriggered?: boolean;
    fallbackReason?: ExecuteSearchMetadata["fallbackReason"];
}): ExecuteSearchMetadata | undefined {
    if (!isShellRipgrepCommand(params.originalCommand)) {
        return undefined;
    }

    return {
        searchPath: "shell_rg",
        wrappedByRTK: params.wrappedByRTK,
        fallbackTriggered: params.fallbackTriggered ?? false,
        fallbackReason: params.fallbackReason,
        originalCommand: params.originalCommand,
        finalCommand: params.finalCommand,
    };
}
