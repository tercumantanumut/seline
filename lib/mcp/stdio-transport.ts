import spawn from "cross-spawn";
import type { ChildProcess, IOType } from "child_process";
import { execSync } from "child_process";
import { PassThrough, type Stream } from "stream";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";

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
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
];

/**
 * Attempt to resolve a command to its absolute path
 * Returns the original command if resolution fails
 */
function resolveCommandPath(command: string): string {
    // Only resolve node-related commands that commonly fail
    if (!["npx", "node", "npm"].includes(command)) {
        return command;
    }

    // If already absolute, use as-is
    if (command.startsWith("/")) {
        return command;
    }

    // Try 'which' command first (works if PATH is correct)
    try {
        const result = execSync(`which ${command}`, {
            encoding: "utf-8",
            timeout: 2000,
        }).trim();
        if (result && result.startsWith("/")) {
            console.log(`[MCP] Resolved command: ${command} → ${result}`);
            return result;
        }
    } catch {
        // which failed, try known paths
    }

    // Fallback: Check known macOS paths directly
    if (process.platform === "darwin") {
        for (const dir of MACOS_NODE_PATHS) {
            const fullPath = `${dir}/${command}`;
            try {
                // Check if file exists and is executable
                execSync(`test -x "${fullPath}"`, { timeout: 1000 });
                console.log(`[MCP] Resolved command via known paths: ${command} → ${fullPath}`);
                return fullPath;
            } catch {
                // Not found in this path
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
                const contents = [
                    "@echo off",
                    "set ELECTRON_RUN_AS_NODE=1",
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
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath 
        || process.env.ELECTRON_RESOURCES_PATH;
    
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
    const baseArgs = serverParams.args ?? [];
    const resolvedCommand = resolveCommandPath(originalCommand);
    const shimDir = ensureNodeShimDir();

    const basePath = serverParams.env?.PATH ?? process.env.PATH;

    if (originalCommand === "npx" || originalCommand === "npm") {
        const cliName = originalCommand === "npx" ? "npx-cli.js" : "npm-cli.js";
        const bundledCli = getBundledNpmCliPath(cliName);
        if (bundledCli) {
            console.log(`[MCP] Using bundled npm CLI for ${originalCommand}: ${bundledCli}`);
            return {
                command: process.execPath,
                args: [bundledCli, ...baseArgs],
                env: {
                    ELECTRON_RUN_AS_NODE: "1",
                    ...(shimDir ? { PATH: prependPath(basePath, shimDir) } : {}),
                },
            };
        }
    }

    if (originalCommand === "node" && !path.isAbsolute(resolvedCommand)) {
        console.log("[MCP] Using Electron as Node runtime for node command");
        return {
            command: process.execPath,
            args: baseArgs,
            env: {
                ELECTRON_RUN_AS_NODE: "1",
                ...(shimDir ? { PATH: prependPath(basePath, shimDir) } : {}),
            },
        };
    }

    return {
        command: resolvedCommand,
        args: baseArgs,
        env: shimDir ? { PATH: prependPath(basePath, shimDir) } : undefined,
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
                console.log(`[MCP] Resolved command: ${this._serverParams.command} → ${resolvedSpawn.command}`);
            }

            // Determine if we're in production
            const isProduction = isProductionBuild();
            
            // In production builds, ALWAYS use 'ignore' for stderr to prevent terminal windows
            // This is critical for both Windows and macOS
            const stderrConfig: IOType = isProduction ? "ignore" : (this._serverParams.stderr as IOType ?? "inherit");

            console.log(`[MCP] Spawn config: platform=${process.platform}, isProduction=${isProduction}, stderr=${stderrConfig}`);

            const spawnOptions: any = {
                env: {
                    ...getDefaultEnvironment(),
                    ...this._serverParams.env,
                    ...resolvedSpawn.env,
                    // Prevent terminal detection in production
                    ...(isProduction ? { 
                        TERM: "dumb",  // Disable color/interactive features
                        NO_COLOR: "1", // Disable colors
                        CI: "1",       // Many tools check this to disable interactive mode
                    } : {}),
                },
                stdio: ["pipe", "pipe", stderrConfig],
                shell: false,
                cwd: this._serverParams.cwd,
            };

            // CRITICAL: Platform-specific window hiding configuration
            if (process.platform === "win32") {
                // Windows: windowsHide only works when NOT using shell and NOT spawning .cmd files
                // Since we resolve npx/npm to their CLI .js files, this should work
                spawnOptions.windowsHide = true;
                spawnOptions.detached = false; // MUST be false for windowsHide to work
            } else if (process.platform === "darwin") {
                // macOS: No windowsHide equivalent, but these settings help:
                // - detached: false keeps the process attached to parent
                // - stdio: ignore for stderr prevents terminal association
                spawnOptions.detached = false;
            }

            console.log(`[MCP] Spawning: ${resolvedSpawn.command} ${(resolvedSpawn.args ?? []).join(" ")}`);
            
            const child = spawn(resolvedSpawn.command, resolvedSpawn.args ?? [], spawnOptions);
            this._process = child;
            child.on("error", (error: Error) => {
                reject(error);
                this.onerror?.(error);
            });
            child.on("spawn", () => {
                console.log(`[MCP] Process spawned with PID: ${child.pid}`);
                resolve();
            });
            child.on("close", (_code: number | null) => {
                this._process = undefined;
                this.onclose?.();
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
