import { spawnSync } from "child_process";

const SHELL_RESOLVE_TIMEOUT_MS = 3000;

const BLOCKED_ENV_KEYS = new Set([
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_NO_ATTACH_CONSOLE",
    "ELECTRON_ENABLE_LOGGING",
]);

let cachedShellEnv: Record<string, string> | null = null;
let shellEnvResolutionAttempted = false;

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

    for (const shellPath of getCandidateShells()) {
        const probe = spawnSync(shellPath, ["-ilc", "env -0"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: SHELL_RESOLVE_TIMEOUT_MS,
            env: process.env,
        });

        if (probe.error || probe.status !== 0 || !probe.stdout) {
            continue;
        }

        const parsed = parseNullSeparatedEnvironment(probe.stdout);
        if (Object.keys(parsed).length > 0) {
            return parsed;
        }
    }

    return {};
}

export function getResolvedShellEnvironment(): Record<string, string> {
    if (!shellEnvResolutionAttempted) {
        shellEnvResolutionAttempted = true;
        cachedShellEnv = resolveShellEnvironmentOnce();
    }

    return cachedShellEnv ?? {};
}

export function resetResolvedShellEnvironmentForTests(): void {
    cachedShellEnv = null;
    shellEnvResolutionAttempted = false;
}
