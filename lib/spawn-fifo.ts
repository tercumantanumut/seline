/**
 * EBADF-safe spawn for Electron's utilityProcess.
 *
 * Inside Electron's utilityProcess on macOS, spawn() with stdio: "pipe" fails
 * with EBADF because libuv's internal pipe creation is broken. However, spawn()
 * with raw FD numbers works fine (proven by spawnWithFileCapture in spawn-utils).
 *
 * This module uses named pipes (FIFOs) to provide streaming stdin/stdout:
 * 1. Create FIFOs on disk via execSync (stdio:"ignore" avoids EBADF)
 * 2. Spawn child via /bin/sh with shell redirection to FIFOs (stdio:"ignore")
 * 3. Open FIFOs from parent side with O_RDWR (non-blocking open)
 * 4. Wrap FDs with Node.js streams for the caller
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Readable, Writable } from "stream";
import { isElectronProduction } from "@/lib/utils/environment";

export interface SpawnedProcessLike {
  stdin: Writable;
  stdout: Readable;
  readonly killed: boolean;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Spawn a process using FIFOs for stdin/stdout (EBADF-safe).
 */
function spawnViaFifo(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
): SpawnedProcessLike {
  const tmpDir = fs.mkdtempSync(join(tmpdir(), "seline-fifo-"));
  const stdinFifo = join(tmpDir, "in");
  const stdoutFifo = join(tmpDir, "out");

  // Create FIFOs — execSync with stdio:"ignore" works in utilityProcess
  execSync(`mkfifo "${stdinFifo}" "${stdoutFifo}"`, { stdio: "ignore" });

  // Spawn child via shell, redirecting its stdio through the FIFOs.
  // The shell handles opening the FIFOs for the child process.
  const cmdStr = [shellEscape(command), ...args.map(shellEscape)].join(" ");
  const child = spawn("/bin/sh", [
    "-c",
    `exec ${cmdStr} < "${stdinFifo}" > "${stdoutFifo}" 2>/dev/null`,
  ], {
    cwd: options.cwd,
    env: options.env,
    stdio: "ignore",
    windowsHide: true,
  });

  // Open FIFOs from parent side.
  // O_RDWR doesn't block on FIFOs (POSIX, works on macOS/Linux).
  // The shell child opens the other ends via its redirections.
  const stdinFd = fs.openSync(stdinFifo, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
  const stdoutFd = fs.openSync(stdoutFifo, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);

  const stdinStream = fs.createWriteStream("", { fd: stdinFd, autoClose: false });
  const stdoutStream = fs.createReadStream("", { fd: stdoutFd, autoClose: false });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { stdinStream.destroy(); } catch { /* noop */ }
    try { stdoutStream.destroy(); } catch { /* noop */ }
    try { fs.closeSync(stdinFd); } catch { /* noop */ }
    try { fs.closeSync(stdoutFd); } catch { /* noop */ }
    try { fs.unlinkSync(stdinFifo); } catch { /* noop */ }
    try { fs.unlinkSync(stdoutFifo); } catch { /* noop */ }
    try { fs.rmdirSync(tmpDir); } catch { /* noop */ }
  };

  child.on("exit", cleanup);
  child.on("error", cleanup);

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    }, { once: true });
  }

  return {
    stdin: stdinStream,
    stdout: stdoutStream,
    get killed() { return child.killed; },
    get exitCode() { return child.exitCode; },
    kill: (signal: NodeJS.Signals) => child.kill(signal),
    on: child.on.bind(child),
    once: child.once.bind(child),
    off: child.off.bind(child),
  };
}

/**
 * Spawn with automatic EBADF avoidance.
 *
 * In Electron production (utilityProcess): uses FIFO-based spawn.
 * In development: uses normal pipe-based spawn.
 */
export function spawnSafe(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  } = {},
): SpawnedProcessLike {
  if (isElectronProduction()) {
    return spawnViaFifo(command, args, options);
  }

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    }, { once: true });
  }

  return {
    stdin: child.stdin!,
    stdout: child.stdout!,
    get killed() { return child.killed; },
    get exitCode() { return child.exitCode; },
    kill: (signal: NodeJS.Signals) => child.kill(signal),
    on: child.on.bind(child),
    once: child.once.bind(child),
    off: child.off.bind(child),
  };
}
