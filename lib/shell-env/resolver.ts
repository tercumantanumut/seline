import { spawnSync, execSync } from "child_process";
import * as fs from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SHELL_RESOLVE_TIMEOUT_MS = 3000;

const BLOCKED_ENV_KEYS = new Set([
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_NO_ATTACH_CONSOLE",
    "ELECTRON_ENABLE_LOGGING",
]);

let cachedShellEnv: Record<string, string> | null = null;
let shellEnvResolutionAttempted = false;
let lastResolutionAttemptMs = 0;

/** Minimum interval between retry attempts when previous resolution returned empty. */
const RETRY_INTERVAL_MS = 5000;

function getCandidateShells(): string[] {
    const candidates = [process.env.SHELL];

    if (process.platform === "darwin") {
        candidates.push("/bin/zsh", "/bin/bash", "/bin/sh");
    } else if (process.platform === "linux") {
        candidates.push("/bin/bash", "/bin/sh");
    }

    const unique = new Set<string>();
    for (const candidate of candidates) {
        if (!candidate || !candidate.startsWith("/")) continue;
        unique.add(candidate);
    }

    return [...unique];
}

function parseNullSeparatedEnvironment(raw: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    const records = raw.split("\0");

    for (const record of records) {
        if (!record) continue;
        const separatorIndex = record.indexOf("=");
        if (separatorIndex <= 0) continue;

        const key = record.slice(0, separatorIndex);
        const value = record.slice(separatorIndex + 1);

        if (!key || BLOCKED_ENV_KEYS.has(key)) continue;
        parsed[key] = value;
    }

    return parsed;
}

function resolveShellEnvironmentOnce(): Record<string, string> {
    if (process.platform === "win32") {
        return {};
    }

    // First try: normal spawnSync with pipes (works in dev, fails in Electron prod)
    for (const shellPath of getCandidateShells()) {
        try {
            const probe = spawnSync(shellPath, ["-ilc", "env -0"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
                timeout: SHELL_RESOLVE_TIMEOUT_MS,
                env: process.env,
            });

            if (probe.error || probe.status !== 0 || !probe.stdout) {
                // If EBADF, break out and try the file-based fallback
                if (probe.error && (probe.error as NodeJS.ErrnoException).code === "EBADF") {
                    break;
                }
                continue;
            }

            const parsed = parseNullSeparatedEnvironment(probe.stdout);
            if (Object.keys(parsed).length > 0) {
                return parsed;
            }
        } catch {
            break;
        }
    }

    // Fallback: capture env to a temp file (avoids pipes entirely).
    // Works in Electron's utilityProcess where spawn with pipes fails.
    try {
        const tmpFile = join(tmpdir(), `seline-env-${process.pid}-${Date.now()}.tmp`);
        for (const shellPath of getCandidateShells()) {
            try {
                execSync(`${shellPath} -ilc 'env -0 > "${tmpFile}"'`, {
                    stdio: "ignore",
                    timeout: SHELL_RESOLVE_TIMEOUT_MS,
                    env: process.env,
                });
                const raw = fs.readFileSync(tmpFile, "utf8");
                try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
                const parsed = parseNullSeparatedEnvironment(raw);
                if (Object.keys(parsed).length > 0) {
                    return parsed;
                }
            } catch {
                try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
                continue;
            }
        }
    } catch {
        // All attempts failed
    }

    return {};
}

export function getResolvedShellEnvironment(): Record<string, string> {
    if (!shellEnvResolutionAttempted) {
        shellEnvResolutionAttempted = true;
        lastResolutionAttemptMs = Date.now();
        cachedShellEnv = resolveShellEnvironmentOnce();

        // If resolution returned empty (likely spawn failure due to EBADF/EMFILE),
        // allow retrying after a cooldown instead of permanently caching the failure.
        if (cachedShellEnv && Object.keys(cachedShellEnv).length === 0) {
            shellEnvResolutionAttempted = false;
            cachedShellEnv = null;
        }
    } else if (
        cachedShellEnv === null &&
        Date.now() - lastResolutionAttemptMs >= RETRY_INTERVAL_MS
    ) {
        // Retry: previous attempt failed and cooldown has elapsed.
        lastResolutionAttemptMs = Date.now();
        const result = resolveShellEnvironmentOnce();
        if (Object.keys(result).length > 0) {
            cachedShellEnv = result;
            shellEnvResolutionAttempted = true;
        }
    }

    return cachedShellEnv ?? {};
}

export function resetResolvedShellEnvironmentForTests(): void {
    cachedShellEnv = null;
    shellEnvResolutionAttempted = false;
}
