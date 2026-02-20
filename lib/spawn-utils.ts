/**
 * Shared EBADF spawn fallback utilities
 *
 * On macOS inside Electron's utilityProcess, creating stdio pipes for child
 * processes can fail with EBADF (bad file descriptor).  These helpers detect
 * the error and provide a file-capture fallback that avoids pipes entirely by
 * redirecting output to temp files via /bin/sh.
 */

import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Returns true when the error is an EBADF (bad file descriptor) failure.
 * On macOS in Electron's utilityProcess, creating stdio pipes triggers EBADF.
 */
export function isEBADFError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (error as NodeJS.ErrnoException).code === "EBADF"
        || error.message.includes("EBADF");
}

/**
 * Shell-escape a single token for embedding inside single quotes.
 * e.g.  hello'world  →  'hello'\''world'
 */
export function shQuote(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Spawn a command with stdout/stderr captured to temp files instead of pipes.
 *
 * On macOS in Electron's utilityProcess, creating stdio pipes fails with EBADF.
 * This fallback avoids all pipe creation by using stdio:["ignore","ignore","ignore"]
 * and redirecting command output to private temp files via /bin/sh, then reading
 * those files once the process exits.
 *
 * @param stdinData - Optional data to write to a temp file and pipe via `< file`
 */
export async function spawnWithFileCapture(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout: number,
    maxOutputSize: number,
    stdinData?: string,
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
}> {
    const tmpDir = await mkdtemp(join(tmpdir(), "seline-exec-"));
    const outFile = join(tmpDir, "out");
    const errFile = join(tmpDir, "err");
    const inFile = join(tmpDir, "in");

    try {
        // If stdin data is provided, write it to a temp file for redirection
        if (stdinData != null) {
            await writeFile(inFile, stdinData, "utf-8");
        }

        // Build a shell command that redirects output to the temp files.
        // Every token is single-quote escaped so arguments with spaces or
        // special characters are handled safely.
        let shellCmd = [command, ...args].map(shQuote).join(" ")
            + ` >${shQuote(outFile)} 2>${shQuote(errFile)}`;

        if (stdinData != null) {
            shellCmd += ` <${shQuote(inFile)}`;
        }

        let timedOut = false;

        const { exitCode, signal } = await new Promise<{
            exitCode: number | null;
            signal: NodeJS.Signals | null;
        }>((resolve, reject) => {
            const child = spawn("/bin/sh", ["-c", shellCmd], {
                cwd,
                env,
                // No pipes at all — this is the whole point of the fallback.
                stdio: ["ignore", "ignore", "ignore"],
                windowsHide: true,
            });

            let settled = false;
            const settle = (v: { exitCode: number | null; signal: NodeJS.Signals | null }) => {
                if (!settled) { settled = true; resolve(v); }
            };

            const timer = setTimeout(() => {
                timedOut = true;
                try { child.kill("SIGTERM"); } catch { /* already dead */ }
                setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ok */ } }, 5000);
            }, timeout);

            child.on("error", (err) => {
                clearTimeout(timer);
                if (!settled) { settled = true; reject(err); }
            });

            child.on("close", (code, sig) => {
                clearTimeout(timer);
                settle({ exitCode: code, signal: sig as NodeJS.Signals | null });
            });
        });

        const [rawOut, rawErr] = await Promise.all([
            readFile(outFile, "utf-8").catch(() => ""),
            readFile(errFile, "utf-8").catch(() => ""),
        ]);

        return {
            stdout: rawOut.slice(0, maxOutputSize),
            stderr: rawErr.slice(0, maxOutputSize),
            exitCode,
            signal,
            timedOut,
        };
    } finally {
        // Non-blocking cleanup; errors are silently ignored.
        rm(tmpDir, { recursive: true, force: true }).catch(() => { /* noop */ });
    }
}
