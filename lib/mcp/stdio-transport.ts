import spawn from "cross-spawn";
import type { ChildProcess, IOType } from "child_process";
import { PassThrough, type Stream } from "stream";
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

function shouldHideWindows(serverParams: StdioServerParameters): boolean {
    if (process.platform !== "win32") {
        return false;
    }
    if (typeof serverParams.windowsHide === "boolean") {
        return serverParams.windowsHide;
    }
    // Allow an opt-out for debugging.
    const showConsole = (process.env.SELINE_MCP_SHOW_CONSOLE || "").toLowerCase();
    return showConsole !== "1" && showConsole !== "true" && showConsole !== "yes";
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
            const child = spawn(this._serverParams.command, this._serverParams.args ?? [], {
                env: {
                    ...getDefaultEnvironment(),
                    ...this._serverParams.env,
                },
                stdio: ["pipe", "pipe", this._serverParams.stderr ?? "inherit"],
                shell: false,
                windowsHide: shouldHideWindows(this._serverParams),
                cwd: this._serverParams.cwd,
            });
            this._process = child;
            child.on("error", (error: Error) => {
                reject(error);
                this.onerror?.(error);
            });
            child.on("spawn", () => {
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
