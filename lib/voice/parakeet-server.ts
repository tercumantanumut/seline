import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParakeetServerState = "idle" | "starting" | "ready" | "stopping" | "error";

export interface ParakeetServerStatus {
  state: ParakeetServerState;
  endpoint: string | null;
  pid: number | null;
  uptime: number | null;
  restartCount: number;
  lastError: string | null;
}

interface StartOptions {
  modelDir: string;
  runtimeBinary: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_PING_INTERVAL_MS = 30_000;
const HEALTH_PING_TIMEOUT_MS = 5_000;
const MAX_CONSECUTIVE_HEALTH_FAILURES = 3;
const MAX_TOTAL_RESTARTS = 5;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let serverProcess: ChildProcess | null = null;
let serverState: ParakeetServerState = "idle";
let serverEndpoint: string | null = null;
let serverStartedAt: number | null = null;
let restartCount = 0;
let lastError: string | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveHealthFailures = 0;

// The options used for the current/last server launch, needed for restarts.
let currentOptions: StartOptions | null = null;

// Promise-based waitForReady: when state is "starting", callers await this.
// The first caller triggers the actual spawn; subsequent callers share the same promise.
let readyPromise: Promise<string> | null = null;
let readyResolve: ((endpoint: string) => void) | null = null;
let readyReject: ((err: Error) => void) | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the WebSocket endpoint for the Parakeet server.
 * If the server is not running, it will be started.
 * If the server is currently starting, the caller blocks until it is ready.
 */
export function getOrStartParakeetServer(options: StartOptions): Promise<string> {
  currentOptions = options;

  if (serverState === "ready" && serverEndpoint) {
    return Promise.resolve(serverEndpoint);
  }

  if (serverState === "starting" && readyPromise) {
    return readyPromise;
  }

  // Transition: idle | error → starting
  return startServer(options);
}

/**
 * Returns a snapshot of the server state.
 */
export function getParakeetServerStatus(): ParakeetServerStatus {
  return {
    state: serverState,
    endpoint: serverEndpoint,
    pid: serverProcess?.pid ?? null,
    uptime: serverStartedAt !== null ? Date.now() - serverStartedAt : null,
    restartCount,
    lastError,
  };
}

/**
 * Gracefully kills the Parakeet server process and resets all state.
 */
export async function shutdownParakeetServer(): Promise<void> {
  if (serverState === "idle") {
    return;
  }

  serverState = "stopping";
  stopHealthCheck();

  // Reject any pending waiters.
  if (readyReject) {
    readyReject(new Error("Parakeet server is shutting down"));
  }
  clearReadyPromise();

  await killProcess();

  serverState = "idle";
  serverEndpoint = null;
  serverStartedAt = null;
  restartCount = 0;
  lastError = null;
  currentOptions = null;
}

// ---------------------------------------------------------------------------
// Internal: spawn & lifecycle
// ---------------------------------------------------------------------------

function startServer(options: StartOptions): Promise<string> {
  serverState = "starting";
  serverEndpoint = null;
  lastError = null;

  readyPromise = new Promise<string>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  spawnServerProcess(options);

  return readyPromise;
}

function spawnServerProcess(options: StartOptions): void {
  const args = [
    `--tokens=${join(options.modelDir, "tokens.txt")}`,
    `--encoder=${join(options.modelDir, "encoder.int8.onnx")}`,
    `--decoder=${join(options.modelDir, "decoder.int8.onnx")}`,
    `--joiner=${join(options.modelDir, "joiner.int8.onnx")}`,
    "--port=0",
    "--num-threads=4",
  ];

  let child: ChildProcess;
  try {
    child = spawn(options.runtimeBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    transitionToError(`Failed to spawn Parakeet server: ${msg}`);
    return;
  }

  serverProcess = child;

  let stderrAccumulator = "";
  let settled = false;

  const startupTimer = setTimeout(() => {
    if (settled) return;
    settled = true;
    try {
      child.kill();
    } catch {}
    transitionToError("Parakeet server startup timed out");
  }, STARTUP_TIMEOUT_MS);

  child.stderr!.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderrAccumulator += text;

    if (settled) return;

    const match = text.match(/Listening on:\s*(ws:\/\/[^\s]+)/i);
    if (match) {
      settled = true;
      clearTimeout(startupTimer);
      const endpoint = match[1];
      transitionToReady(endpoint);
    }
  });

  child.stdout!.on("data", () => {
    // Drain stdout to prevent buffer backpressure. We don't need stdout data.
  });

  child.on("error", (err: Error) => {
    if (!settled) {
      settled = true;
      clearTimeout(startupTimer);
      transitionToError(`Parakeet server process error: ${err.message}`);
    }
  });

  child.on("close", (code: number | null) => {
    if (!settled) {
      settled = true;
      clearTimeout(startupTimer);
      transitionToError(
        `Parakeet server exited during startup (code ${code}): ${stderrAccumulator.slice(0, 300)}`
      );
      return;
    }

    // Process exited after it was already running (crash, OOM, signal, etc.)
    if (serverState === "ready") {
      console.warn(`[parakeet-server] Server process exited unexpectedly (code ${code})`);
      handleUnexpectedExit();
    }
    // If state is "stopping" we don't need to do anything — shutdown is intentional.
  });
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

function transitionToReady(endpoint: string): void {
  serverState = "ready";
  serverEndpoint = endpoint;
  serverStartedAt = Date.now();
  consecutiveHealthFailures = 0;

  console.log(`[parakeet-server] Ready at ${endpoint} (pid=${serverProcess?.pid})`);

  startHealthCheck();

  if (readyResolve) {
    readyResolve(endpoint);
  }
  clearReadyPromise();
}

function transitionToError(message: string): void {
  serverState = "error";
  lastError = message;
  serverEndpoint = null;
  serverStartedAt = null;
  stopHealthCheck();

  console.error(`[parakeet-server] Error: ${message}`);

  if (readyReject) {
    readyReject(new Error(message));
  }
  clearReadyPromise();
}

function handleUnexpectedExit(): void {
  serverState = "error";
  serverEndpoint = null;
  serverStartedAt = null;
  serverProcess = null;
  stopHealthCheck();

  if (currentOptions && restartCount < MAX_TOTAL_RESTARTS) {
    restartCount += 1;
    console.log(
      `[parakeet-server] Attempting restart ${restartCount}/${MAX_TOTAL_RESTARTS}...`
    );
    startServer(currentOptions);
  } else {
    lastError = `Server exited unexpectedly and restart limit reached (${restartCount}/${MAX_TOTAL_RESTARTS})`;
    console.error(`[parakeet-server] ${lastError}`);
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function startHealthCheck(): void {
  stopHealthCheck();
  consecutiveHealthFailures = 0;

  healthCheckTimer = setInterval(() => {
    performHealthPing();
  }, HEALTH_PING_INTERVAL_MS);
}

function stopHealthCheck(): void {
  if (healthCheckTimer !== null) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

function performHealthPing(): void {
  if (serverState !== "ready" || !serverEndpoint) {
    return;
  }

  const endpoint = serverEndpoint;

  let ws: WebSocket | null = null;
  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    try {
      ws?.close();
    } catch {}
    onHealthPingFailed("Health ping timed out");
  }, HEALTH_PING_TIMEOUT_MS);

  try {
    ws = new WebSocket(endpoint);
  } catch (err) {
    clearTimeout(timer);
    settled = true;
    const msg = err instanceof Error ? err.message : String(err);
    onHealthPingFailed(`Failed to open WebSocket: ${msg}`);
    return;
  }

  ws.addEventListener("open", () => {
    if (settled) return;
    // Send an empty message as a ping. The server should respond or at least
    // accept the connection, which is enough to prove it's alive.
    try {
      ws!.send("");
    } catch {}

    // If we got this far, the server is alive. Close and mark success.
    clearTimeout(timer);
    settled = true;
    try {
      ws!.close();
    } catch {}
    onHealthPingSuccess();
  });

  ws.addEventListener("error", () => {
    if (settled) return;
    clearTimeout(timer);
    settled = true;
    onHealthPingFailed("WebSocket connection error");
  });
}

function onHealthPingSuccess(): void {
  consecutiveHealthFailures = 0;
}

function onHealthPingFailed(reason: string): void {
  consecutiveHealthFailures += 1;
  console.warn(
    `[parakeet-server] Health check failed (${consecutiveHealthFailures}/${MAX_CONSECUTIVE_HEALTH_FAILURES}): ${reason}`
  );

  if (consecutiveHealthFailures >= MAX_CONSECUTIVE_HEALTH_FAILURES) {
    console.warn("[parakeet-server] Too many consecutive health failures. Restarting server...");
    restartAfterHealthFailure();
  }
}

async function restartAfterHealthFailure(): Promise<void> {
  stopHealthCheck();

  if (serverState === "stopping") return;

  serverState = "stopping";
  await killProcess();

  serverState = "idle";
  serverEndpoint = null;
  serverStartedAt = null;

  if (currentOptions && restartCount < MAX_TOTAL_RESTARTS) {
    restartCount += 1;
    console.log(
      `[parakeet-server] Health-triggered restart ${restartCount}/${MAX_TOTAL_RESTARTS}...`
    );
    startServer(currentOptions);
  } else {
    serverState = "error";
    lastError = `Server unresponsive and restart limit reached (${restartCount}/${MAX_TOTAL_RESTARTS})`;
    console.error(`[parakeet-server] ${lastError}`);
  }
}

// ---------------------------------------------------------------------------
// Process management helpers
// ---------------------------------------------------------------------------

function killProcess(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    const proc = serverProcess;
    serverProcess = null;

    // If the process already exited, nothing to do.
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 3_000);

    proc.once("close", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}

function clearReadyPromise(): void {
  readyPromise = null;
  readyResolve = null;
  readyReject = null;
}
