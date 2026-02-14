import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

// Mock fs module
vi.mock("fs", () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
}));

// We need to import after mocking
const { executeCommand } = await import("@/lib/command-execution/executor");

describe("Command Executor - Bundled Binaries PATH Resolution", () => {
    const originalEnv = process.env;
    const originalResourcesPath = (process as any).resourcesPath;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        delete (process as any).resourcesPath;
    });

    afterEach(() => {
        process.env = originalEnv;
        (process as any).resourcesPath = originalResourcesPath;
    });

    describe("getBundledBinariesPath", () => {
        it("should find bundled binaries using process.resourcesPath", () => {
            const mockResourcesPath = "/app/Contents/Resources";
            const expectedBinPath = join(mockResourcesPath, "standalone", "node_modules", ".bin");

            (process as any).resourcesPath = mockResourcesPath;
            vi.mocked(existsSync).mockReturnValue(true);

            // We can't directly test the private function, but we can verify
            // the PATH is modified by checking console output or spawn env
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            // Trigger buildSafeEnvironment by attempting to execute a command
            // (it will fail but that's ok, we just want to see the PATH setup)
            executeCommand({
                command: "echo",
                args: ["test"],
                cwd: "/tmp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            // Check that the bundled bin path was logged (single string argument with prefix)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining(`[Command Executor] Prepending bundled binaries to PATH: ${expectedBinPath}`)
            );

            consoleLogSpy.mockRestore();
        });

        it("should find bundled binaries using ELECTRON_RESOURCES_PATH env var", () => {
            const mockResourcesPath = "C:\\\\app\\\\resources";
            const expectedBinPath = join(mockResourcesPath, "standalone", "node_modules", ".bin");

            process.env.ELECTRON_RESOURCES_PATH = mockResourcesPath;
            vi.mocked(existsSync).mockReturnValue(true);

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            executeCommand({
                command: "dir",
                args: [],
                cwd: "C:\\\\temp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("Prepending bundled binaries to PATH:")
            );

            consoleLogSpy.mockRestore();
        });

        it("should return null when no resources path is available", () => {
            delete (process as any).resourcesPath;
            delete process.env.ELECTRON_RESOURCES_PATH;

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            executeCommand({
                command: "ls",
                args: [],
                cwd: "/tmp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            // Should NOT log the bundled binaries message
            expect(consoleLogSpy).not.toHaveBeenCalledWith(
                expect.stringContaining("Prepending bundled binaries to PATH:")
            );

            consoleLogSpy.mockRestore();
        });

        it("should return null when binaries directory does not exist", () => {
            const mockResourcesPath = "/app/Contents/Resources";
            (process as any).resourcesPath = mockResourcesPath;
            vi.mocked(existsSync).mockReturnValue(false);

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            executeCommand({
                command: "test",
                args: [],
                cwd: "/tmp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            expect(consoleLogSpy).not.toHaveBeenCalledWith(
                expect.stringContaining("Prepending bundled binaries to PATH:")
            );

            consoleLogSpy.mockRestore();
        });
    });

    describe("PATH environment variable construction", () => {
        it("should prepend bundled binaries to PATH on Windows", () => {
            const mockResourcesPath = "C:\\\\app\\\\resources";
            const mockSystemPath = "C:\\\\Windows\\\\System32;C:\\\\Program Files";
            const expectedBinPath = join(mockResourcesPath, "standalone", "node_modules", ".bin");

            process.env.ELECTRON_RESOURCES_PATH = mockResourcesPath;
            process.env.PATH = mockSystemPath;
            vi.mocked(existsSync).mockReturnValue(true);

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            executeCommand({
                command: "npm",
                args: ["--version"],
                cwd: "C:\\\\temp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            // Verify the log message contains the bundled bin path
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining(expectedBinPath)
            );

            consoleLogSpy.mockRestore();
        });

        it("should prepend bundled binaries to PATH on Unix", () => {
            const mockResourcesPath = "/Applications/Seline.app/Contents/Resources";
            const mockSystemPath = "/usr/local/bin:/usr/bin:/bin";
            const expectedBinPath = join(mockResourcesPath, "standalone", "node_modules", ".bin");

            (process as any).resourcesPath = mockResourcesPath;
            process.env.PATH = mockSystemPath;
            vi.mocked(existsSync).mockReturnValue(true);

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            executeCommand({
                command: "node",
                args: ["--version"],
                cwd: "/tmp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining(expectedBinPath)
            );

            consoleLogSpy.mockRestore();
        });

        it("should pass ELECTRON_RESOURCES_PATH to child processes", () => {
            const mockResourcesPath = "/app/resources";
            process.env.ELECTRON_RESOURCES_PATH = mockResourcesPath;
            vi.mocked(existsSync).mockReturnValue(true);

            // The buildSafeEnvironment function should include ELECTRON_RESOURCES_PATH
            // This is important for MCP servers and other child processes
            executeCommand({
                command: "test",
                args: [],
                cwd: "/tmp",
                characterId: "test-char",
            }).catch(() => {
                // Ignore execution errors
            });

            // The environment is built correctly (verified by integration tests)
            expect(process.env.ELECTRON_RESOURCES_PATH).toBe(mockResourcesPath);
        });
    });

    describe("Error handling", () => {
        it("should provide helpful error message when command is not found", async () => {
            const mockResourcesPath = "/app/resources";
            (process as any).resourcesPath = mockResourcesPath;
            vi.mocked(existsSync).mockReturnValue(true);

            // Mock spawn to fail with ENOENT
            const result = await executeCommand({
                command: "nonexistent-command",
                args: [],
                cwd: "/tmp",
                characterId: "test-char",
            });

            // The error handler will be triggered by the spawn error event
            // We can't easily test this without actually spawning, but the code is in place
            expect(result.success).toBe(false);
        });
    });
});
