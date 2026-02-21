import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock fs so bundled-binaries path resolution doesn't touch the real filesystem
vi.mock("fs", () => ({
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
}));

const {
    executeCommand,
    startBackgroundProcess,
    getBackgroundProcess,
    killBackgroundProcess,
    listBackgroundProcesses,
    cleanupBackgroundProcesses,
    isEBADFError,
    spawnWithFileCapture,
} = await import("@/lib/command-execution/executor");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait until `fn()` returns truthy, polling every `interval` ms. */
async function waitFor(fn: () => boolean, timeout = 10_000, interval = 100) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > timeout) throw new Error("waitFor timed out");
        await new Promise((r) => setTimeout(r, interval));
    }
}

// ── needsWindowsShell (tested indirectly via executeCommand) ─────────────────

describe("Windows shell detection", () => {
    // We can't set process.platform at runtime, so we test the *observable*
    // behavior: npm/npx commands succeed instead of hanging.  On non-Windows
    // CI this is a no-op (shell:false works fine for real executables).

    it("should execute 'node --version' successfully", async () => {
        const result = await executeCommand({
            command: "node",
            args: ["--version"],
            cwd: process.cwd(),
            characterId: "test",
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("should execute 'npm --version' without hanging", async () => {
        const result = await executeCommand({
            command: "npm",
            args: ["--version"],
            cwd: process.cwd(),
            characterId: "test",
            timeout: 15_000,
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("should execute 'npx --version' without hanging", async () => {
        const result = await executeCommand({
            command: "npx",
            args: ["--version"],
            cwd: process.cwd(),
            characterId: "test",
            timeout: 15_000,
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toMatch(/^\d+\.\d+/);
    });
});

// ── Smart timeout defaults ───────────────────────────────────────────────────

describe("Smart timeout defaults", () => {
    it("should use default 30s for normal commands", async () => {
        // A quick command should resolve well within 30s
        const result = await executeCommand({
            command: "node",
            args: ["-e", "console.log('fast')"],
            cwd: process.cwd(),
            characterId: "test",
            // no explicit timeout → default 30s
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toBe("fast");
    });

    it("should respect explicit timeout override", async () => {
        // Very short timeout to force a timeout error
        const result = await executeCommand({
            command: "node",
            args: ["-e", "setTimeout(() => console.log('done'), 5000)"],
            cwd: process.cwd(),
            characterId: "test",
            timeout: 500, // 0.5s → will timeout
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("timeout");
    });
});

// ── stdio: ["ignore", ...] prevents stdin hang ──────────────────────────────

describe("stdin handling", () => {
    it("should not hang when command expects stdin (stdin is ignored)", async () => {
        // `node -e "process.stdin.resume()"` would hang forever if stdin
        // were piped. With stdio:["ignore",...] it gets EOF immediately.
        const result = await executeCommand({
            command: "node",
            args: ["-e", "process.stdin.once('end', () => console.log('eof')); process.stdin.resume()"],
            cwd: process.cwd(),
            characterId: "test",
            timeout: 5000,
        });

        // stdin is ignored → the stream is not connected, so the process
        // gets an EOF or the pipe is not available. Either way it should
        // finish quickly rather than hanging.
        expect(result.executionTime).toBeLessThan(5000);
    });
});

// ── Background process management ────────────────────────────────────────────

describe("Background process management", () => {
    afterEach(() => {
        // Kill any lingering background processes
        for (const p of listBackgroundProcesses()) {
            if (p.running) killBackgroundProcess(p.id);
        }
        cleanupBackgroundProcesses(0);
    });

    it("should start a background process and return a processId", async () => {
        const result = await startBackgroundProcess({
            command: "node",
            args: ["-e", "setTimeout(() => console.log('bg-done'), 500)"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        expect(result.processId).toBeTruthy();
        expect(result.processId).toMatch(/^bg-/);
        expect(result.error).toBeUndefined();
    });

    it("should track a running background process", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "setTimeout(() => console.log('alive'), 2000)"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        // Immediately after start it should be running
        const info = getBackgroundProcess(processId);
        expect(info).not.toBeNull();
        expect(info!.running).toBe(true);
        expect(info!.command).toBe("node");
    });

    it("should capture stdout from background process after completion", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "console.log('hello-from-bg')"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        // Wait for it to finish
        await waitFor(() => !getBackgroundProcess(processId)!.running);

        const info = getBackgroundProcess(processId)!;
        expect(info.running).toBe(false);
        expect(info.exitCode).toBe(0);
        expect(info.stdout).toContain("hello-from-bg");
    });

    it("should capture stderr from background process", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "console.error('err-output'); process.exit(1)"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        await waitFor(() => !getBackgroundProcess(processId)!.running);

        const info = getBackgroundProcess(processId)!;
        expect(info.running).toBe(false);
        expect(info.exitCode).toBe(1);
        expect(info.stderr).toContain("err-output");
    });

    it("should kill a running background process", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "setInterval(() => {}, 1000)"], // runs forever
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        // Ensure it's running
        expect(getBackgroundProcess(processId)!.running).toBe(true);

        // Kill it
        const killed = killBackgroundProcess(processId);
        expect(killed).toBe(true);

        // Wait for close event
        await waitFor(() => !getBackgroundProcess(processId)!.running, 10_000);
        expect(getBackgroundProcess(processId)!.running).toBe(false);
    });

    it("should return false when killing a non-existent process", () => {
        expect(killBackgroundProcess("bg-nonexistent")).toBe(false);
    });

    it("should list background processes", async () => {
        await startBackgroundProcess({
            command: "node",
            args: ["-e", "setTimeout(() => {}, 2000)"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        await startBackgroundProcess({
            command: "node",
            args: ["-e", "setTimeout(() => {}, 2000)"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        const list = listBackgroundProcesses();
        expect(list.length).toBeGreaterThanOrEqual(2);

        for (const p of list) {
            expect(p.id).toMatch(/^bg-/);
            expect(p.command).toContain("node");
        }
    });

    it("should clean up finished background processes", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "console.log('done')"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        await waitFor(() => !getBackgroundProcess(processId)!.running);

        // Process should still be queryable before cleanup
        expect(getBackgroundProcess(processId)).not.toBeNull();

        // Cleanup with maxAge=0 → remove all finished
        cleanupBackgroundProcesses(0);

        expect(getBackgroundProcess(processId)).toBeNull();
    });

    it("should reject blocked commands in background mode", async () => {
        const result = await startBackgroundProcess({
            command: "rm",
            args: ["-rf", "/"],
            cwd: process.cwd(),
            characterId: "test",
        }, [process.cwd()]);

        expect(result.processId).toBe("");
        expect(result.error).toBeTruthy();
    });

    it("should timeout a background process after the specified duration", async () => {
        const { processId } = await startBackgroundProcess({
            command: "node",
            args: ["-e", "setInterval(() => {}, 1000)"], // runs forever
            cwd: process.cwd(),
            characterId: "test",
            timeout: 1000, // 1 second timeout
        }, [process.cwd()]);

        // Wait for timeout to kick in
        await waitFor(() => !getBackgroundProcess(processId)!.running, 15_000);

        const info = getBackgroundProcess(processId)!;
        expect(info.running).toBe(false);
        expect(info.stderr).toContain("timed out");
    });
});

// ── Command validation in executor ───────────────────────────────────────────

describe("Command validation in executor", () => {
    it("should block dangerous commands", async () => {
      const result = await executeCommand({
        command: "rm",
        args: ["-rf", "/"],
        cwd: process.cwd(),
        characterId: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires explicit confirmation");
    });

    it("should not fail validation just because command contains shell characters", async () => {
        const result = await executeCommand({
            command: "echo; rm -rf /",
            args: [],
            cwd: process.cwd(),
            characterId: "test",
        });

        expect(result.success).toBe(false);
        expect(result.error).not.toContain("potentially dangerous characters");
    });

    it("should allow safe commands", async () => {
        const result = await executeCommand({
            command: "node",
            args: ["-e", "console.log('safe')"],
            cwd: process.cwd(),
            characterId: "test",
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toBe("safe");
    });
});

// ── isEBADFError helper ───────────────────────────────────────────────────────

describe("isEBADFError", () => {
    it("returns true for an error with code EBADF", () => {
        const err = Object.assign(new Error("spawn EBADF"), { code: "EBADF" });
        expect(isEBADFError(err)).toBe(true);
    });

    it("returns true for an error whose message contains EBADF", () => {
        expect(isEBADFError(new Error("spawn EBADF"))).toBe(true);
    });

    it("returns false for ENOENT", () => {
        const err = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
        expect(isEBADFError(err)).toBe(false);
    });

    it("returns false for a generic error", () => {
        expect(isEBADFError(new Error("something went wrong"))).toBe(false);
    });
});

// ── spawnWithFileCapture (unit) ───────────────────────────────────────────────

describe("spawnWithFileCapture", () => {
    const env = process.env as NodeJS.ProcessEnv;

    it("captures stdout and returns exitCode 0 for a successful command", async () => {
        const result = await spawnWithFileCapture(
            "node", ["-e", "console.log('hello from file capture')"],
            process.cwd(), env, 10_000, 1048576,
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("hello from file capture");
        expect(result.timedOut).toBe(false);
    });

    it("captures stderr for a command that writes to stderr", async () => {
        const result = await spawnWithFileCapture(
            "node", ["-e", "console.error('err-output'); process.exit(1)"],
            process.cwd(), env, 10_000, 1048576,
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr.trim()).toBe("err-output");
    });

    it("handles arguments with spaces correctly", async () => {
        const result = await spawnWithFileCapture(
            "node", ["-e", "console.log(process.argv.slice(1).join('|'))", "hello world", "foo bar"],
            process.cwd(), env, 10_000, 1048576,
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("hello world");
        expect(result.stdout).toContain("foo bar");
    });

    it("handles arguments with single quotes correctly", async () => {
        const result = await spawnWithFileCapture(
            "node", ["-e", "console.log(process.argv.slice(1).join(' '))", "it's", "a", "test"],
            process.cwd(), env, 10_000, 1048576,
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("it's a test");
    });

    it("respects the timeout and sets timedOut=true", async () => {
        const result = await spawnWithFileCapture(
            "node", ["-e", "setInterval(() => {}, 10_000)"],
            process.cwd(), env, 300 /* 300 ms */, 1048576,
        );
        expect(result.timedOut).toBe(true);
    });

    it("truncates output that exceeds maxOutputSize", async () => {
        // Write 100 bytes but limit to 50
        const result = await spawnWithFileCapture(
            "node", ["-e", "process.stdout.write('-'.repeat(100))"],
            process.cwd(), env, 10_000, 50,
        );
        expect(result.stdout.length).toBeLessThanOrEqual(50);
    });

    it("cleans up temp files after execution", async () => {
        // fs/promises is not mocked, so readdir works fine here.
        const { readdir } = await import("fs/promises");
        const beforeFiles = (await readdir(tmpdir())).filter(f => f.startsWith("seline-exec-"));

        await spawnWithFileCapture(
            "node", ["-e", "console.log('cleanup-test')"],
            process.cwd(), env, 10_000, 1048576,
        );

        // Allow async cleanup to settle
        await new Promise(r => setTimeout(r, 200));

        const afterFiles = (await readdir(tmpdir())).filter(f => f.startsWith("seline-exec-"));
        // No new seline-exec- dirs should remain
        expect(afterFiles.length).toBeLessThanOrEqual(beforeFiles.length);
    });
});

// ── EBADF fallback integration ────────────────────────────────────────────────

describe("executeCommand EBADF fallback", () => {
    // ESM modules don't allow spying on child_process.spawn directly, so we
    // test the fallback path by calling spawnWithFileCapture (the exact function
    // executeCommand's error handler delegates to) and confirming it recovers
    // correctly — the same code that runs on a real EBADF in production.

    it("spawnWithFileCapture produces the same output as a direct spawn", async () => {
        if (process.platform === "win32") return; // fallback is darwin/linux only

        const env = process.env as NodeJS.ProcessEnv;

        // Run the same command both ways and compare outputs.
        const direct = await executeCommand({
            command: "echo",
            args: ["ebadf-fallback-works"],
            cwd: process.cwd(),
            characterId: "test",
        });

        const fallback = await spawnWithFileCapture(
            "echo", ["ebadf-fallback-works"],
            process.cwd(), env, 10_000, 1048576,
        );

        expect(direct.success).toBe(true);
        expect(fallback.exitCode).toBe(0);
        // Both approaches should produce identical stdout.
        expect(fallback.stdout.trim()).toBe(direct.stdout.trim());
    });

    it("spawnWithFileCapture handles a failing command and returns non-zero exitCode", async () => {
        const env = process.env as NodeJS.ProcessEnv;

        const result = await spawnWithFileCapture(
            "node", ["-e", "console.log('fail-output'); process.exit(42)"],
            process.cwd(), env, 10_000, 1048576,
        );

        expect(result.exitCode).toBe(42);
        expect(result.stdout.trim()).toBe("fail-output");
        expect(result.timedOut).toBe(false);
    });
});
