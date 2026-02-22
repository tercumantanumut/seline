import spawn from "cross-spawn";
import type { ChildProcess, IOType } from "child_process";
import { execSync, spawnSync } from "child_process";
import { PassThrough, type Stream } from "stream";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { isEBADFError } from "@/lib/spawn-utils";

export type StdioServerParameters = {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    stderr?: IOType | Stream | number;
    cwd?: string;
    windowsHide?: boolean;
};

const DEFAULT_INHERITED_ENV_VARS = process.platform === "win32"
    ? [
        "APPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "PATH",
        "PROCESSOR_ARCHITECTURE",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "USERNAME",
        "USERPROFILE",
        "PROGRAMFILES",
    ]
    : ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];

/**
 * Known locations for Node.js binaries on macOS
 */
const MACOS_NODE_PATHS = [
    "/usr/bin",
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
];

type BundledNodeProbeCache = {
    binaryPath: string;
    usable: boolean;
};

let bundledNodeProbeCache: BundledNodeProbeCache | null = null;

function normalizeExecutableName(command: string): string {
    const baseName = path.basename(command).toLowerCase();
    return baseName.replace(/\.(cmd|exe|bat)$/i, "");
}

function isExecutable(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}


/**
 * Attempt to resolve a command to its absolute path
 * Returns the original command if resolution fails
 */
function resolveCommandPath(command: string): string {
    const normalizedCommand = normalizeExecutableName(command);
    // Only resolve node-related commands that commonly fail
    if (!["npx", "node", "npm"].includes(normalizedCommand)) {
        return command;
    }

    // If already absolute, use as-is
    if (path.isAbsolute(command)) {
        return command;
    }

    // Avoid shell lookups on Windows to prevent "which" errors.
    if (process.platform === "win32") {
        return command;
    }

    // Try a POSIX lookup first (works if PATH is correct)
    try {
        const result = execSync(`command -v ${normalizedCommand}`, {
            encoding: "utf-8",
            timeout: 2000,
        }).trim();
        if (result && path.isAbsolute(result)) {
            console.log(`[MCP] Resolved command: ${command} -> ${result}`);
            return result;
        }
    } catch {
        // command -v failed, try known paths
    }

    // Fallback: Check known macOS paths directly
    if (process.platform === "darwin") {
        for (const dir of MACOS_NODE_PATHS) {
            const fullPath = path.join(dir, normalizedCommand);
            if (isExecutable(fullPath)) {
                console.log(`[MCP] Resolved command via known paths: ${command} -> ${fullPath}`);
                return fullPath;
            }
        }
    }

    // Return original command as last resort
    return command;
}

type ResolvedSpawnCommand = {
    command: string;
    args: string[];
    env?: Record<string, string>;
};

function isNodeRuntimeUsable(binaryPath: string): boolean {
    return isBundledNodeUsable(binaryPath);
}

function getSystemNodeExe(basePath: string | undefined): string | null {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const nodeBinaryName = process.platform === "win32" ? "node.exe" : "node";

    const pushCandidate = (candidate: string | null | undefined): void => {
        if (!candidate || !path.isAbsolute(candidate)) {
            return;
        }

        const normalized = path.normalize(candidate);
        if (seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        candidates.push(candidate);
    };

    for (const dir of (basePath ?? "").split(path.delimiter).filter(Boolean)) {
        pushCandidate(path.join(dir, nodeBinaryName));
    }

    pushCandidate(resolveCommandPath("node"));

    if (process.platform === "darwin") {
        for (const dir of MACOS_NODE_PATHS) {
            pushCandidate(path.join(dir, nodeBinaryName));
        }
    }

    for (const candidate of candidates) {
        if (process.platform !== "win32" && !isExecutable(candidate)) {
            continue;
        }

        if (!isNodeRuntimeUsable(candidate)) {
            continue;
        }

        return candidate;
    }

    return null;
}

function isBundledNodeUsable(binaryPath: string): boolean {
    if (bundledNodeProbeCache?.binaryPath === binaryPath) {
        return bundledNodeProbeCache.usable;
    }

    try {
        const probe = spawnSync(binaryPath, ["--version"], {
            // Keep stdin as a pipe to avoid ignore-related EBADF issues in some Electron contexts.
            stdio: ["pipe", "ignore", "ignore"],
            windowsHide: true,
            timeout: 2000,
        });

        const usable = !probe.error && probe.status === 0;
        if (!usable) {
            const reason = probe.error
                ? probe.error.message
                : `exitCode=${probe.status ?? "null"} signal=${probe.signal ?? "null"}`;
            console.warn(`[MCP] Bundled node probe failed: ${binaryPath} (${reason})`);
        }

        bundledNodeProbeCache = { binaryPath, usable };
        return usable;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[MCP] Bundled node probe threw for ${binaryPath}: ${message}`);
        bundledNodeProbeCache = { binaryPath, usable: false };
        return false;
    }
}

/**
 * Get path to bundled Node.js binary (Windows and macOS, production builds)
 * Returns null if not found or not on a supported platform
 */
function getBundledNodeExe(): string | null {
    if (process.platform !== "win32" && process.platform !== "darwin") {
        return null;
    }

    const resourcesPath = process.env.ELECTRON_RESOURCES_PATH
        || (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

    if (!resourcesPath) {
        return null;
    }

    const nodeBinaryName = process.platform === "win32" ? "node.exe" : "node";
    const bundledNodePath = path.join(resourcesPath, "standalone", "node_modules", ".bin", nodeBinaryName);

    try {
        if (!fs.existsSync(bundledNodePath)) {
            return null;
        }

        if (process.platform !== "win32" && !isExecutable(bundledNodePath)) {
            console.warn(`[MCP] Bundled ${nodeBinaryName} is not executable: ${bundledNodePath}`);
            return null;
        }

        if (!isBundledNodeUsable(bundledNodePath)) {
            console.warn(`[MCP] Bundled ${nodeBinaryName} is unusable, falling back to Electron runtime`);
            return null;
        }

        console.log(`[MCP] Found bundled ${nodeBinaryName} at: ${bundledNodePath}`);
        return bundledNodePath;
    } catch {
        // Ignore filesystem errors
    }

    return null;
}

function ensureNodeShimDir(): string | null {
    const baseDir = process.env.ELECTRON_USER_DATA_PATH || os.tmpdir();
    if (!baseDir) {
        return null;
    }

    const shimDir = path.join(baseDir, ".seline-node", "bin");
    const shimPath = path.join(shimDir, process.platform === "win32" ? "node.cmd" : "node");

    try {
        if (!fs.existsSync(shimPath)) {
            fs.mkdirSync(shimDir, { recursive: true });
            if (process.platform === "win32") {
                // Windows node.cmd shim - fallback if bundled node.exe not available
                // Note: cmd.exe may briefly flash a window when npm/npx spawns this shim.
                const contents = [
                    "@echo off",
                    "set ELECTRON_RUN_AS_NODE=1",
                    "set ELECTRON_NO_ATTACH_CONSOLE=1",
                    "set ELECTRON_ENABLE_LOGGING=0",
                    `"${process.execPath}" %*`,
                    "",
                ].join("\r\n");
                fs.writeFileSync(shimPath, contents, { encoding: "utf-8" });
            } else {
                const escapedExecPath = process.execPath.replace(/"/g, '\\"');
                const contents = [
                    "#!/bin/sh",
                    "export ELECTRON_RUN_AS_NODE=1",
                    `exec "${escapedExecPath}" "$@"`,
                    "",
                ].join("\n");
                fs.writeFileSync(shimPath, contents, { encoding: "utf-8", mode: 0o755 });
                fs.chmodSync(shimPath, 0o755);
            }
        }
        return shimDir;
    } catch {
        return null;
    }
}

/**
 * Get the directory containing a node binary that should be prepended to PATH.
 * This ensures spawned processes (like npx installing packages that internally
 * spawn `node`) can always find a working node runtime via PATH lookup.
 *
 * Priority: bundled node's .bin dir > Electron-as-Node shim dir > null
 */
function getNodeBinDir(): string | null {
    const bundledNode = getBundledNodeExe();
    if (bundledNode) {
        return path.dirname(bundledNode);
    }

    return ensureNodeShimDir();
}

function prependPath(existingPath: string | undefined, extraDir: string): string {
    const delimiter = path.delimiter;
    const trimmed = existingPath || "";
    const parts = trimmed.split(delimiter).filter(Boolean);
    if (parts.includes(extraDir)) {
        return trimmed;
    }
    return [extraDir, trimmed].filter(Boolean).join(delimiter);
}

function getBundledNpmCliPath(cliName: "npx-cli.js" | "npm-cli.js"): string | null {
    // In packaged Electron apps, process.resourcesPath is only available in the main process.
    // For the Next.js server (child process), we use ELECTRON_RESOURCES_PATH env var.
    const resourcesPath = process.env.ELECTRON_RESOURCES_PATH
        || (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    
    const candidates = [
        // Primary: bundled in resources/standalone/node_modules/npm/bin/
        path.join(resourcesPath ?? "", "standalone", "node_modules", "npm", "bin", cliName),
        // Fallback: relative to cwd (for dev mode)
        path.join(process.cwd(), "node_modules", "npm", "bin", cliName),
    ];
    
    console.log(`[MCP] Looking for bundled ${cliName}, resourcesPath=${resourcesPath}, candidates:`, candidates);

    for (const candidate of candidates) {
        try {
            if (candidate && fs.existsSync(candidate)) {
                return candidate;
            }
        } catch {
            // Ignore filesystem errors while probing.
        }
    }

    return null;
}

function resolveSpawnCommand(serverParams: StdioServerParameters): ResolvedSpawnCommand {
    const originalCommand = serverParams.command;
    const normalizedCommand = normalizeExecutableName(originalCommand);
    const baseArgs = serverParams.args ?? [];
    const resolvedCommand = resolveCommandPath(originalCommand);
    const nodeBinDir = getNodeBinDir();

    const basePath = serverParams.env?.PATH ?? process.env.PATH;

    // On Windows, prefer bundled node.exe to avoid console window flashing
    // The bundled node.exe is a real console app where windowsHide works correctly,
    // unlike Electron with ELECTRON_RUN_AS_NODE which still allocates a console
    const bundledNodeExe = getBundledNodeExe();

    if (normalizedCommand === "npx" || normalizedCommand === "npm") {
        const cliName = normalizedCommand === "npx" ? "npx-cli.js" : "npm-cli.js";
        const bundledCli = getBundledNpmCliPath(cliName);
        if (bundledCli) {
            // Prefer bundled node first, then a verified system node, and finally Electron.
            const systemNodeExe = getSystemNodeExe(basePath);
            const nodeRuntime = bundledNodeExe ?? systemNodeExe ?? process.execPath;
            const useElectronRunAsNode = !bundledNodeExe && !systemNodeExe;

            console.log(`[MCP] Using bundled npm CLI for ${originalCommand}: ${bundledCli} (runtime: ${nodeRuntime})`);
            return {
                command: nodeRuntime,
                args: [bundledCli, ...baseArgs],
                env: {
                    ...(useElectronRunAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
                    ...(nodeBinDir ? { PATH: prependPath(basePath, nodeBinDir) } : {}),
                },
            };
        }
    }

    if (normalizedCommand === "node" && !path.isAbsolute(resolvedCommand)) {
        // Use bundled node.exe on Windows if available
        if (bundledNodeExe) {
            console.log(`[MCP] Using bundled node.exe for node command: ${bundledNodeExe}`);
            return {
                command: bundledNodeExe,
                args: baseArgs,
                env: nodeBinDir ? { PATH: prependPath(basePath, nodeBinDir) } : undefined,
            };
        }

        const systemNodeExe = getSystemNodeExe(basePath);
        if (systemNodeExe) {
            console.log(`[MCP] Using system node for node command: ${systemNodeExe}`);
            return {
                command: systemNodeExe,
                args: baseArgs,
                env: nodeBinDir ? { PATH: prependPath(basePath, nodeBinDir) } : undefined,
            };
        }

        console.log("[MCP] Using Electron as Node runtime for node command");
        return {
            command: process.execPath,
            args: baseArgs,
            env: {
                ELECTRON_RUN_AS_NODE: "1",
                ...(nodeBinDir ? { PATH: prependPath(basePath, nodeBinDir) } : {}),
            },
        };
    }

    return {
        command: resolvedCommand,
        args: baseArgs,
        env: nodeBinDir ? { PATH: prependPath(basePath, nodeBinDir) } : undefined,
    };
}

function getDefaultEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of DEFAULT_INHERITED_ENV_VARS) {
        const value = process.env[key];
        if (value === undefined) {
            continue;
        }
        if (value.startsWith("()")) {
            // Skip functions, which are a security risk.
            continue;
        }
        env[key] = value;
    }
    return env;
}

/**
 * Determine if we're running in a production (packaged) environment
 */
function isProductionBuild(): boolean {
    // Check various indicators of a packaged Electron app
    const isElectronDev = process.env.ELECTRON_IS_DEV === "1" || process.env.NODE_ENV === "development";

    // Check for explicit production marker (set by Electron main process)
    const hasProductionMarker = process.env.SELINE_PRODUCTION_BUILD === "1";

    // Check for resourcesPath (direct Electron) or ELECTRON_RESOURCES_PATH (Next.js server)
    const hasResourcesPath = !!(process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        || !!process.env.ELECTRON_RESOURCES_PATH;

    const isProduction = (hasProductionMarker || hasResourcesPath) && !isElectronDev;

    console.log(`[MCP] isProductionBuild check: hasProductionMarker=${hasProductionMarker}, hasResourcesPath=${hasResourcesPath}, isElectronDev=${isElectronDev}, result=${isProduction}`);

    return isProduction;
}

/**
 * Detect if we're running in an Electron environment (main or renderer process)
 * This checks for Electron-specific process properties
 */
function isElectronEnvironment(): boolean {
    return (
        typeof process !== 'undefined' &&
        (
            // Direct Electron indicator
            !!process.versions?.electron ||
            // Running as Electron node (ELECTRON_RUN_AS_NODE)
            process.env.ELECTRON_RUN_AS_NODE === '1' ||
            // Electron resources path indicators
            !!(process as any).resourcesPath ||
            !!process.env.ELECTRON_RESOURCES_PATH ||
            // Electron user data path
            !!process.env.ELECTRON_USER_DATA_PATH
        )
    );
}

export class StdioClientTransport implements Transport {
    private _process?: ChildProcess;
    private _readBuffer = new ReadBuffer();
    private _serverParams: StdioServerParameters;
    private _stderrStream: Stream | null = null;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    constructor(server: StdioServerParameters) {
        this._serverParams = server;
        if (server.stderr === "pipe" || server.stderr === "overlapped") {
            this._stderrStream = new PassThrough();
        }
    }

    async start(): Promise<void> {
        if (this._process) {
            throw new Error("StdioClientTransport already started!");
        }
        return new Promise((resolve, reject) => {
            // Resolve command path with bundled npm fallback for packaged apps.
            const resolvedSpawn = resolveSpawnCommand(this._serverParams);

            if (resolvedSpawn.command !== this._serverParams.command) {
                console.log(`[MCP] Resolved command: ${this._serverParams.command} -> ${resolvedSpawn.command}`);
            }

            // Determine if we're in production or Electron environment
            const isProduction = isProductionBuild();
            const isElectron = isElectronEnvironment();

            // In production builds OR Electron environments, ALWAYS use 'ignore' for stderr
            // This prevents:
            // - Terminal windows in production (Windows and macOS)
            // - EBADF errors in Electron (where stdio descriptors may be invalid)
            // In Electron, we MUST avoid 'inherit' because stdio descriptors may not be valid,
            // even in development mode, leading to spawn EBADF errors
            const stderrConfig: IOType | Stream | number = (() => {
                if (isProduction || isElectron) {
                    // Use 'ignore' to avoid invalid descriptor issues
                    return "ignore";
                }
                // Non-Electron dev: Allow user-specified stderr or default to 'pipe'
                return this._serverParams.stderr ?? "pipe";
            })();

            const stderrLabel = typeof stderrConfig === "string" ? stderrConfig : "stream";
            console.log(`[MCP] Spawn config: platform=${process.platform}, isProduction=${isProduction}, isElectron=${isElectron}, stderr=${stderrLabel}`);

            const spawnOptions: any = {
                env: {
                    ...getDefaultEnvironment(),
                    ...this._serverParams.env,
                    ...resolvedSpawn.env,
                    // Prevent terminal detection and window spawning
                    TERM: "dumb",  // Disable color/interactive features
                    NO_COLOR: "1", // Disable colors
                    CI: "1",       // Many tools check this to disable interactive mode
                    // Electron-specific: prevent console window allocation
                    // When Electron runs with ELECTRON_RUN_AS_NODE=1, it may still allocate
                    // a console for stdio. These vars attempt to prevent that.
                    ELECTRON_NO_ATTACH_CONSOLE: "1",
                    ELECTRON_ENABLE_LOGGING: "0",
                    ELECTRON_NO_ASAR: "1",  // Disable asar support when running as Node
                },
                stdio: ["pipe", "pipe", stderrConfig],
                shell: false,
                cwd: this._serverParams.cwd,
                // CRITICAL: These options prevent terminal windows on ALL platforms
                // windowsHide: true - Hides console window on Windows (no-op on other platforms)
                // detached: false - Keeps process attached to parent, required for windowsHide
                windowsHide: true,
                detached: false,
            };

            console.log(`[MCP] Spawning: ${resolvedSpawn.command} ${(resolvedSpawn.args ?? []).join(" ")}`);
            
            const child = spawn(resolvedSpawn.command, resolvedSpawn.args ?? [], spawnOptions);
            this._process = child;
            // Track early exit for diagnostics
            let earlyExitCode: number | null = null;
            let earlyExitSignal: NodeJS.Signals | null = null;
            let spawnResolved = false;

            child.on("error", (error: Error) => {
                if (isEBADFError(error) && process.platform === "darwin") {
                    const ebadfError = new Error(
                        `MCP server "${resolvedSpawn.command}" failed to start: pipe creation failed with EBADF ` +
                        `in Electron utilityProcess on macOS. The stdio transport requires live pipes which are ` +
                        `not available in this environment. Consider using an SSE/streamable-HTTP transport instead.`
                    );
                    console.error("[MCP]", ebadfError.message);
                    reject(ebadfError);
                    this.onerror?.(ebadfError);
                    return;
                }
                reject(error);
                this.onerror?.(error);
            });
            child.on("spawn", () => {
                console.log(`[MCP] Process spawned with PID: ${child.pid}`);
                // Give process a brief moment to crash before declaring success.
                // Catches immediate failures (bad binary, missing deps, Gatekeeper kill).
                setTimeout(() => {
                    spawnResolved = true;
                    if (earlyExitCode !== null) {
                        const msg =
                            `MCP server process exited immediately with code ${earlyExitCode}` +
                            `${earlyExitSignal ? ` (signal: ${earlyExitSignal})` : ""}. ` +
                            `Command: ${resolvedSpawn.command} ${(resolvedSpawn.args ?? []).join(" ")}. ` +
                            `This may indicate the bundled Node.js binary cannot run on this system, ` +
                            `or the MCP package failed to install via npx.`;
                        console.error(`[MCP] ${msg}`);
                        reject(new Error(msg));
                    } else {
                        resolve();
                    }
                }, 150);
            });
            child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                earlyExitCode = code;
                earlyExitSignal = signal;
                if (code !== null && code !== 0) {
                    console.error(
                        `[MCP] Process exited with code ${code}` +
                        `${signal ? ` (signal: ${signal})` : ""}` +
                        ` — command: ${resolvedSpawn.command} ${(resolvedSpawn.args ?? []).join(" ")}`
                    );
                } else if (signal) {
                    console.warn(`[MCP] Process killed by signal ${signal} — command: ${resolvedSpawn.command}`);
                }
                this._process = undefined;
                // If spawn already resolved, fire onclose normally.
                // If not yet resolved, the spawn handler's setTimeout will pick up the exit.
                if (spawnResolved) {
                    this.onclose?.();
                }
            });
            child.stdin?.on("error", (error: Error) => {
                this.onerror?.(error);
            });
            child.stdout?.on("data", (chunk: Buffer) => {
                this._readBuffer.append(chunk);
                this.processReadBuffer();
            });
            child.stdout?.on("error", (error: Error) => {
                this.onerror?.(error);
            });
            if (this._stderrStream && child.stderr) {
                child.stderr.pipe(this._stderrStream);
            }
        });
    }

    get stderr(): Stream | null {
        if (this._stderrStream) {
            return this._stderrStream;
        }
        return this._process?.stderr ?? null;
    }

    get pid(): number | null {
        return this._process?.pid ?? null;
    }

    private processReadBuffer(): void {
        while (true) {
            try {
                const message = this._readBuffer.readMessage();
                if (message === null) {
                    break;
                }
                this.onmessage?.(message);
            } catch (error) {
                this.onerror?.(error as Error);
            }
        }
    }

    async close(): Promise<void> {
        if (this._process) {
            const processToClose = this._process;
            this._process = undefined;
            const closePromise = new Promise<void>(resolve => {
                processToClose.once("close", () => {
                    resolve();
                });
            });
            try {
                processToClose.stdin?.end();
            } catch {
                // ignore
            }
            await Promise.race([closePromise, new Promise(resolve => setTimeout(resolve, 2000).unref())]);
            if (processToClose.exitCode === null) {
                try {
                    processToClose.kill("SIGTERM");
                } catch {
                    // ignore
                }
                await Promise.race([closePromise, new Promise(resolve => setTimeout(resolve, 2000).unref())]);
            }
            if (processToClose.exitCode === null) {
                try {
                    processToClose.kill("SIGKILL");
                } catch {
                    // ignore
                }
            }
        }
        this._readBuffer.clear();
    }

    send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
        return new Promise(resolve => {
            if (!this._process?.stdin) {
                throw new Error("Not connected");
            }
            const json = serializeMessage(message);
            if (this._process.stdin.write(json)) {
                resolve();
            } else {
                this._process.stdin.once("drain", resolve);
            }
        });
    }
}
