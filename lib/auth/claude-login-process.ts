import { spawn, ChildProcess } from "child_process";
import path from "path";
import { isElectronProduction } from "@/lib/utils/environment";

// Resolved lazily so process.cwd() is evaluated at runtime, not build time.
// In production Electron builds, node_modules live under resourcesPath/standalone/.
function getCliPath(): string {
  const resourcesPath =
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ||
    process.env.ELECTRON_RESOURCES_PATH;

  if (resourcesPath) {
    // Production Electron: modules are bundled under standalone/
    const prodPath = path.join(resourcesPath, "standalone", "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js");
    const fs = require("fs") as typeof import("fs");
    if (fs.existsSync(prodPath)) return prodPath;
  }

  return path.join(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk/cli.js");
}

function fileExistsAndExecutable(filePath: string): boolean {
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(filePath)) return false;
  if (process.platform === "win32") return true;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getSystemNodeBinary(nodeName: string): string | null {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidateDirs = [
    ...pathEntries,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/opt/local/bin",
  ];

  for (const dir of candidateDirs) {
    const candidate = path.join(dir, nodeName);
    if (fileExistsAndExecutable(candidate)) return candidate;
  }

  // Check versioned homebrew installs (e.g. node@22, node@20)
  // These don't get symlinked to /opt/homebrew/bin when installed as node@XX
  const fs = require("fs") as typeof import("fs");
  for (const prefix of ["/opt/homebrew/opt", "/usr/local/opt"]) {
    try {
      const entries = fs.readdirSync(prefix);
      for (const entry of entries) {
        if (entry.startsWith("node")) {
          const candidate = path.join(prefix, entry, "bin", nodeName);
          if (fileExistsAndExecutable(candidate)) return candidate;
        }
      }
    } catch {
      // directory doesn't exist
    }
  }

  // Check common version manager paths
  const home = process.env.HOME;
  if (home) {
    const versionManagerPaths = [
      path.join(home, ".volta", "bin"),
      path.join(home, ".fnm", "aliases", "default", "bin"),
    ];
    for (const dir of versionManagerPaths) {
      const candidate = path.join(dir, nodeName);
      if (fileExistsAndExecutable(candidate)) return candidate;
    }

    // nvm: check for any installed version
    try {
      const nvmDir = path.join(home, ".nvm", "versions", "node");
      const versions = fs.readdirSync(nvmDir).sort().reverse();
      for (const ver of versions) {
        const candidate = path.join(nvmDir, ver, "bin", nodeName);
        if (fileExistsAndExecutable(candidate)) return candidate;
      }
    } catch {
      // nvm not installed
    }
  }

  return null;
}

/**
 * Returns the Node.js binary used to run claude-agent-sdk/cli.js.
 * Resolution order:
 *   1. System node from PATH / common macOS install locations
 *   2. Bundled node at $ELECTRON_RESOURCES_PATH/standalone/node_modules/.bin/node
 *   3. process.cwd()/node_modules/.bin/node (standalone server cwd)
 *   4. process.execPath fallback
 */
export function getNodeBinary(): string {
  const nodeName = process.platform === "win32" ? "node.exe" : "node";

  const systemNode = getSystemNodeBinary(nodeName);
  if (systemNode) return systemNode;

  const resourcesPath = process.env.ELECTRON_RESOURCES_PATH;
  if (resourcesPath) {
    const candidate = path.join(resourcesPath, "standalone", "node_modules", ".bin", nodeName);
    if (fileExistsAndExecutable(candidate)) return candidate;
  }

  const cwdCandidate = path.join(process.cwd(), "node_modules", ".bin", nodeName);
  if (fileExistsAndExecutable(cwdCandidate)) return cwdCandidate;

  return process.execPath;
}

const URL_PATTERN = /https?:\/\/[^\s"')]+/i;

interface LoginProcessState {
  process: ChildProcess;
  url: string | null;
  outputLines: string[];
  resolved: boolean;
}

// Use globalThis so the singleton survives across Turbopack route-bundle isolation.
// Each API route gets its own module copy, but globalThis is always the same object.
const g = globalThis as typeof globalThis & { __claudeLoginState?: LoginProcessState | null };
if (!("__claudeLoginState" in g)) g.__claudeLoginState = null;

function getActive(): LoginProcessState | null {
  return g.__claudeLoginState ?? null;
}
function setActive(state: LoginProcessState | null): void {
  g.__claudeLoginState = state;
}

function killActive(): void {
  const active = getActive();
  if (active && !active.process.killed) {
    active.process.kill("SIGTERM");
  }
  setActive(null);
}

/**
 * Starts `claude login` as a persistent subprocess with stdin pipe.
 * Waits up to `urlTimeoutMs` for the auth URL to appear in output,
 * then returns it so the caller can open a browser.
 */
export async function startClaudeLoginProcess(
  urlTimeoutMs = 15_000,
): Promise<{ url: string | null; output: string[] }> {
  killActive();

  const nodeBinary = getNodeBinary();
  const useElectronRunAsNode = isElectronProduction() && nodeBinary === process.execPath;

  const spawnEnv = { ...process.env };
  delete spawnEnv.CLAUDECODE; // prevent "nested session" detection
  if (useElectronRunAsNode) {
    spawnEnv.ELECTRON_RUN_AS_NODE = "1";
  }

  const state: LoginProcessState = {
    process: spawn(nodeBinary, [getCliPath(), "login"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: spawnEnv,
    }),
    url: null,
    outputLines: [],
    resolved: false,
  };

  setActive(state);

  // Handle spawn errors to prevent unhandled crashes
  state.process.once("error", (err) => {
    console.error("[claude-login] spawn error:", err.message);
    state.resolved = true;
  });

  function onData(chunk: Buffer) {
    const text = chunk.toString();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) state.outputLines.push(trimmed);
    }
    if (!state.url) {
      const match = text.match(URL_PATTERN);
      if (match) state.url = match[0];
    }
  }

  state.process.stdout?.on("data", onData);
  state.process.stderr?.on("data", onData);

  // Wait until URL appears or timeout
  const deadline = Date.now() + urlTimeoutMs;
  while (Date.now() < deadline && !state.url && !state.resolved) {
    await new Promise((r) => setTimeout(r, 150));
    if (state.process.exitCode !== null) break; // process exited early
  }

  return { url: state.url, output: state.outputLines };
}

/**
 * Writes the authorization code to the waiting subprocess stdin,
 * then waits for it to exit (success = exit code 0).
 */
export async function submitClaudeLoginCode(
  code: string,
  timeoutMs = 30_000,
): Promise<{ success: boolean; error?: string }> {
  const activeLogin = getActive();
  if (!activeLogin || activeLogin.process.killed || activeLogin.process.exitCode !== null) {
    return { success: false, error: "No active login process. Please restart the login flow." };
  }

  const proc = activeLogin.process;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: "Timed out waiting for claude to accept the code." });
    }, timeoutMs);

    proc.once("exit", (exitCode) => {
      clearTimeout(timer);
      if (exitCode === 0) {
        setActive(null);
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `claude exited with code ${exitCode}` });
      }
    });

    proc.once("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });

    try {
      proc.stdin?.write(code.trim() + "\n");
    } catch (err) {
      clearTimeout(timer);
      resolve({ success: false, error: String(err) });
    }
  });
}

export function getActiveLoginUrl(): string | null {
  return getActive()?.url ?? null;
}

/** Kill any hanging login subprocess. Call this before Agent SDK auth checks. */
export function killLoginProcess(): void {
  killActive();
}
