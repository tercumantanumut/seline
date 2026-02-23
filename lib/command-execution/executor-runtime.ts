/**
 * Bundled-runtime detection and safe environment building.
 * Handles packaged Electron builds that include standalone Node.js/npm/npx binaries.
 *
 * Extracted from executor.ts to isolate platform/path detection concerns.
 */

import { existsSync } from "fs";
import { basename, isAbsolute, join } from "path";

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
    const pathValue = prependBundledPaths(process.env.PATH || "", runtime);
    if (runtime.bundledBinDirs.length > 0) {
        console.log(`[Command Executor] Prepending bundled binaries to PATH: ${runtime.bundledBinDirs.join(", ")}`);
    }

    return {
        PATH: pathValue,
        HOME: process.env.HOME || process.env.USERPROFILE,
        USER: process.env.USER || process.env.USERNAME,
        LANG: process.env.LANG,
        TERM: process.env.TERM || "xterm-256color",
        SYSTEMROOT: process.env.SYSTEMROOT,
        COMSPEC: process.env.COMSPEC,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        USERPROFILE: process.env.USERPROFILE,
        ELECTRON_RESOURCES_PATH: process.env.ELECTRON_RESOURCES_PATH,
    };
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
