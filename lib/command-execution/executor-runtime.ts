/**
 * Bundled-runtime detection and safe environment building.
 * Handles packaged Electron builds that include standalone Node.js/npm/npx binaries.
 *
 * Extracted from executor.ts to isolate platform/path detection concerns.
 */

import { existsSync } from "fs";
import { basename, isAbsolute, join } from "path";
import { tmpdir } from "os";
import { getResolvedShellEnvironment } from "@/lib/shell-env/resolver";

const BLOCKED_ENV_KEYS = new Set([
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_NO_ATTACH_CONSOLE",
    "ELECTRON_ENABLE_LOGGING",
    "NODE_ENV",
    "SELENE_PRODUCTION_BUILD",
]);

/**
 * Prefix patterns for env vars that should never leak to child processes.
 * __NEXT_PRIVATE_* vars are internal to the running Next.js instance —
 * leaking them causes child Next.js processes (e.g. in synced project folders)
 * to use the wrong project root, turbopack config, or React bundle.
 */
const BLOCKED_ENV_PREFIXES = ["__NEXT_PRIVATE_"];

function sanitizeEnvironment(env: Record<string, string | undefined>): Record<string, string | undefined> {
    const sanitized = { ...env };
    for (const key of BLOCKED_ENV_KEYS) {
        delete sanitized[key];
    }
    for (const key of Object.keys(sanitized)) {
        if (BLOCKED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            delete sanitized[key];
        }
    }
    return sanitized;
}

export type BundledRuntimeInfo = {
    resourcesPath: string | null;
    isProductionBuild: boolean;
    nodeBinDir: string | null;
    toolsBinDir: string | null;
    bundledBinDirs: string[];
    bundledNodePath: string | null;
    bundledNpmCliPath: string | null;
    bundledNpxCliPath: string | null;
};

export function getResourcesPath(): string | null {
    return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        || process.env.ELECTRON_RESOURCES_PATH
        || null;
}

export function getBundledRuntimeInfo(): BundledRuntimeInfo {
    const resourcesPath = getResourcesPath();
    const nodeBinDir = resourcesPath ? join(resourcesPath, "standalone", "node_modules", ".bin") : null;
    const toolsBinDir = resourcesPath ? join(resourcesPath, "standalone", "tools", "bin") : null;
    const bundledNodePath = nodeBinDir
        ? join(nodeBinDir, process.platform === "win32" ? "node.exe" : "node")
        : null;
    const bundledNpmCliPath = resourcesPath
        ? join(resourcesPath, "standalone", "node_modules", "npm", "bin", "npm-cli.js")
        : null;
    const bundledNpxCliPath = resourcesPath
        ? join(resourcesPath, "standalone", "node_modules", "npm", "bin", "npx-cli.js")
        : null;

    const bundledCandidates = [nodeBinDir, toolsBinDir].filter((candidate): candidate is string => Boolean(candidate));
    const bundledBinDirs = bundledCandidates.filter((candidate) => existsSync(candidate));

    return {
        resourcesPath,
        isProductionBuild: !!resourcesPath && process.env.ELECTRON_IS_DEV !== "1" && process.env.NODE_ENV !== "development",
        nodeBinDir,
        toolsBinDir,
        bundledBinDirs,
        bundledNodePath: bundledNodePath && existsSync(bundledNodePath) ? bundledNodePath : null,
        bundledNpmCliPath: bundledNpmCliPath && existsSync(bundledNpmCliPath) ? bundledNpmCliPath : null,
        bundledNpxCliPath: bundledNpxCliPath && existsSync(bundledNpxCliPath) ? bundledNpxCliPath : null,
    };
}

export function prependBundledPaths(pathValue: string, runtime: BundledRuntimeInfo): string {
    if (runtime.bundledBinDirs.length === 0) return pathValue;
    const pathSeparator = process.platform === "win32" ? ";" : ":";
    return `${runtime.bundledBinDirs.join(pathSeparator)}${pathSeparator}${pathValue}`;
}

/**
 * Build a minimal, safe environment for command execution.
 * Includes bundled Node.js binaries in PATH for packaged apps.
 */
export function buildSafeEnvironment(runtime: BundledRuntimeInfo): Record<string, string | undefined> {
    const shellEnv = getResolvedShellEnvironment();
    const baseEnv = { ...process.env, ...shellEnv } as Record<string, string | undefined>;

    // On Windows, process.env is a case-insensitive Proxy, but spreading it
    // creates a plain (case-sensitive) object where PATH is typically stored
    // as "Path". Collect the value case-insensitively (last match wins, so
    // shellEnv can override process.env) and remove all variants to avoid
    // duplicate/conflicting PATH entries in the child environment.
    let currentPath = "";
    if (process.platform === "win32") {
        for (const key of Object.keys(baseEnv)) {
            if (key.toUpperCase() === "PATH") {
                currentPath = (baseEnv[key] as string) || currentPath;
                delete baseEnv[key];
            }
        }
    } else {
        currentPath = (baseEnv.PATH as string) || "";
    }
    const pathValue = prependBundledPaths(currentPath, runtime);

    if (runtime.bundledBinDirs.length > 0) {
        console.log(`[Command Executor] Prepending bundled binaries to PATH: ${runtime.bundledBinDirs.join(", ")}`);
    }

    // On Windows, expose TMPDIR so scripts using $TMPDIR or process.env.TMPDIR
    // resolve to the correct Windows temp directory instead of failing on /tmp.
    const tmpOverrides: Record<string, string> = {};
    if (process.platform === "win32") {
        tmpOverrides.TMPDIR = tmpdir();
    }

    return sanitizeEnvironment({
        ...baseEnv,
        ...tmpOverrides,
        PATH: pathValue,
        TERM: baseEnv.TERM || "xterm-256color",
        HOME: baseEnv.HOME || baseEnv.USERPROFILE,
        USER: baseEnv.USER || baseEnv.USERNAME,
        ELECTRON_RESOURCES_PATH: process.env.ELECTRON_RESOURCES_PATH || runtime.resourcesPath || undefined,
    });
}

// ── Unix-to-Windows path normalization ────────────────────────────────────────

/**
 * Unix temp-dir prefixes that should be mapped to os.tmpdir() on Windows.
 * Longer prefixes first for clarity (order doesn't affect correctness).
 */
const UNIX_TEMP_PREFIXES = ["/var/tmp", "/tmp"];

/**
 * Translate a single Unix-style temp path to the Windows equivalent.
 * Only active on Windows; returns the argument unchanged on other platforms.
 *
 * Handles:
 *   /tmp/file.json           → C:\Users\...\AppData\Local\Temp\file.json
 *   /var/tmp/data.json       → C:\Users\...\AppData\Local\Temp\data.json
 *   --output=/tmp/file.json  → --output=C:\Users\...\AppData\Local\Temp\file.json
 */
export function normalizeUnixPath(arg: string): string {
    if (process.platform !== "win32") return arg;

    // Handle --flag=/tmp/... style arguments
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0 && arg.startsWith("-")) {
        const prefix = arg.slice(0, eqIndex + 1);
        const value = arg.slice(eqIndex + 1);
        const normalized = normalizeUnixPath(value);
        return normalized !== value ? prefix + normalized : arg;
    }

    for (const unixPrefix of UNIX_TEMP_PREFIXES) {
        if (arg === unixPrefix || arg.startsWith(unixPrefix + "/")) {
            const remainder = arg.slice(unixPrefix.length); // "" or "/file.json"
            return join(tmpdir(), remainder.replace(/^\//, ""));
        }
    }

    return arg;
}

/**
 * Normalize all Unix temp paths in an args array.
 */
export function normalizeArgs(args: string[]): string[] {
    if (process.platform !== "win32") return args;
    return args.map(normalizeUnixPath);
}

export function normalizeExecutable(command: string): string {
    return basename(command.trim()).toLowerCase().replace(/\.(?:cmd|bat|exe)$/i, "");
}

export function resolveBundledNodeCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    runtime: BundledRuntimeInfo,
): { command: string; args: string[]; env: NodeJS.ProcessEnv; resolution: string | null } {
    if (!runtime.resourcesPath || isAbsolute(command)) {
        return { command, args, env, resolution: null };
    }

    const normalized = normalizeExecutable(command);
    if (normalized === "node" && runtime.bundledNodePath) {
        return { command: runtime.bundledNodePath, args, env, resolution: `resolved '${command}' to bundled node` };
    }

    if (normalized === "npm" && runtime.bundledNodePath && runtime.bundledNpmCliPath) {
        return {
            command: runtime.bundledNodePath,
            args: [runtime.bundledNpmCliPath, ...args],
            env,
            resolution: "resolved 'npm' via bundled node + npm-cli.js",
        };
    }

    if (normalized === "npx" && runtime.bundledNodePath && runtime.bundledNpxCliPath) {
        return {
            command: runtime.bundledNodePath,
            args: [runtime.bundledNpxCliPath, ...args],
            env,
            resolution: "resolved 'npx' via bundled node + npx-cli.js",
        };
    }

    return { command, args, env, resolution: null };
}

export function buildNotFoundDiagnostic(
    command: string,
    runtime: BundledRuntimeInfo,
    env: NodeJS.ProcessEnv,
    resolution: string | null,
): string {
    const pathSeparator = process.platform === "win32" ? ";" : ":";
    const effectivePathHead = (env.PATH || "").split(pathSeparator).slice(0, 5).join("\n  ");
    const lines = [
        `Mode: ${runtime.isProductionBuild ? "packaged" : "development"}`,
        `resourcesPath: ${runtime.resourcesPath ?? "<none>"}`,
        `bundled node bin dir: ${runtime.nodeBinDir ?? "<none>"} (exists=${runtime.nodeBinDir ? existsSync(runtime.nodeBinDir) : false})`,
        `bundled tools bin dir: ${runtime.toolsBinDir ?? "<none>"} (exists=${runtime.toolsBinDir ? existsSync(runtime.toolsBinDir) : false})`,
        `bundled node binary: ${runtime.bundledNodePath ?? "<missing>"}`,
        `bundled npm cli: ${runtime.bundledNpmCliPath ?? "<missing>"}`,
        `bundled npx cli: ${runtime.bundledNpxCliPath ?? "<missing>"}`,
        `effective PATH prefix:\n  ${effectivePathHead || "<empty>"}`,
    ];

    if (resolution) lines.push(`command resolution: ${resolution}`);
    lines.push(`requested command: ${command}`);
    return lines.join("\n");
}
